import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { computeLetterbox, MODEL_SIZE, type LetterboxInfo } from "../../../src/zones/tank/vision/decode";
import { config } from "./config";

/**
 * Pulls decoded frames out of a live stream, forever.
 *
 * ffmpeg does the decode and the letterbox, but at dimensions WE computed:
 * `computeLetterbox` decides the scale and pad, and the filter graph is built
 * from its numbers. Letting ffmpeg pick (force_original_aspect_ratio=decrease
 * plus pad) would look equivalent and usually agree, but its rounding is its
 * own business — and any disagreement would shift every box by a pixel or two
 * in a way nothing would ever report. This way the geometry the decoder undoes
 * is the geometry ffmpeg applied, by construction.
 *
 * Output is raw RGBA at MODEL_SIZE², which `rgbaToTensor` consumes directly.
 */
export const FRAME_BYTES = MODEL_SIZE * MODEL_SIZE * 4;

/**
 * How long a loudness reading stays at full strength.
 *
 * ebur128 lines arrive unevenly — often under a second apart, sometimes
 * several seconds. This window is sized to cover the gaps, not to describe
 * how long audio 'lasts'.
 */
const AUDIO_HOLD_MS = 8_000;

/**
 * How long the held reading takes to fade to zero once it is stale.
 *
 * Long enough that a momentary gap never reads as silence, short enough that
 * a genuinely dead meter stops claiming the room is loud.
 */
const AUDIO_DECAY_MS = 12_000;
export type Frame = {
  /** Raw RGBA, exactly FRAME_BYTES long. */
  rgba: Uint8Array;
  /** The geometry applied, needed to map boxes back to source pixels. */
  letterbox: LetterboxInfo;
  sourceWidth: number;
  sourceHeight: number;
  capturedAt: number;
};

type ProbeResult = { width: number; height: number; hasAudio: boolean };

/** Reads the source's real dimensions. Without these the letterbox is a guess. */
export async function probeStream(url: string, timeoutMs = 20_000): Promise<ProbeResult> {
  const args = [
    "-v", "error",
    // Every stream, not just v:0 — the audio branch of the filter graph must
    // only be built when there IS audio, so this has to see all of them.
    "-show_entries", "stream=index,codec_type,width,height",
    "-of", "json",
    url,
  ];
  const probe = config.ffmpegPath.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace(/ffmpeg/i, "ffprobe"));

  return new Promise<ProbeResult>((resolve, reject) => {
    const child = spawn(probe, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { stdout += String(c); });
    child.stderr.on("data", (c) => { stderr = (stderr + String(c)).slice(-2_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${stderr}`));
      try {
        const parsed = JSON.parse(stdout) as {
          streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
        };
        const streams = parsed.streams ?? [];
        const video = streams.find((entry) => entry.codec_type === "video");
        const hasAudio = streams.some((entry) => entry.codec_type === "audio");
        const width = Number(video?.width);
        const height = Number(video?.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
          return reject(new Error("ffprobe reported no usable video dimensions."));
        }
        resolve({ width, height, hasAudio });
      } catch (error) {
        reject(new Error(`Could not parse ffprobe output: ${String(error)}`));
      }
    });
  });
}

/**
 * One long-lived ffmpeg per camera, emitting letterboxed RGBA frames.
 *
 * Only the newest complete frame is retained. Inference takes ~500ms and
 * capture runs independently, so a queue would only ever grow and hand the
 * director progressively staler boxes — for a tracker, the freshest frame is
 * the only one worth looking at.
 */
export class FramePuller {
  readonly cameraId: string;
  private url: string;
  // stdin is "ignore": we only ever read from this child, never write to it.
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private pending: Buffer = Buffer.alloc(0);
  private latest: Frame | null = null;
  private geometry: { letterbox: LetterboxInfo; width: number; height: number } | null = null;
  private stopped = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private framesSeen = 0;
  private lastFrameAt = 0;
  /**
   * Whether the source carries audio at all.
   *
   * Load-bearing: referencing [0:a] in the filter graph when there is no audio
   * stream makes ffmpeg fail to build the graph, which kills the VIDEO branch
   * too. A camera without a microphone would stop being watched entirely — the
   * unit test caught exactly that, on a silent fixture.
   */
  private hasAudio = false;
  /** Momentary loudness, LUFS. null until ebur128 has reported. */
  private loudnessLufs: number | null = null;
  private loudnessAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private lastError: string | null = null;

  constructor(cameraId: string, url: string) {
    this.cameraId = cameraId;
    this.url = url;
  }

  get stats() {
    return {
      cameraId: this.cameraId,
      framesSeen: this.framesSeen,
      // Age of the newest frame. `framesSeen` is CUMULATIVE and so cannot
      // distinguish a healthy puller from one that produced frames for an hour
      // and then stalled — which is exactly how the foyer camera went eight
      // hours without a single detection while still reporting as fine.
      lastFrameAgeMs: this.lastFrameAt ? Date.now() - this.lastFrameAt : null,
      loudnessLufs: this.loudnessLufs,
      stalled: this.isStalled(),
      running: this.child !== null,
      lastError: this.lastError,
      sourceWidth: this.geometry?.width ?? null,
      sourceHeight: this.geometry?.height ?? null,
    };
  }

  /** The newest frame, or null when none has arrived or the last one is stale. */
  takeLatest(maxAgeMs = config.frameStaleMs): Frame | null {
    const frame = this.latest;
    if (!frame) return null;
    if (Date.now() - frame.capturedAt > maxAgeMs) return null;
    return frame;
  }

  async start(): Promise<void> {
    if (this.stopped) return;
    try {
      const probed = await probeStream(this.url);
      this.geometry = {
        width: probed.width,
        height: probed.height,
        letterbox: computeLetterbox(probed.width, probed.height),
      };
      this.hasAudio = probed.hasAudio;
      this.spawnFfmpeg();
      this.lastError = null;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.scheduleRestart();
    }
  }

  private spawnFfmpeg() {
    const geo = this.geometry;
    if (!geo || this.stopped) return;

    const nw = Math.round(geo.width * geo.letterbox.scale);
    const nh = Math.round(geo.height * geo.letterbox.scale);
    const { padX, padY } = geo.letterbox;

    const args = [
      "-hide_banner",
      // `info`, not `error`: ebur128 reports loudness at info level, and that
      // report is the only audio signal this worker has. The stderr handler
      // below separates those lines from genuine errors.
      "-loglevel", "info",
      // No -fflags nobuffer / -flags low_delay here, deliberately. They look
      // like the obvious choice for a live source, but measured on 2026-09-09
      // they make ffmpeg exit 0 having written NOTHING to stdout — a silent
      // zero-frame failure that looks exactly like a dead camera. They also buy
      // nothing: detection does not care about sub-second latency (the browser
      // engine ticked every 2s), so the only thing they could have bought was
      // the bug.
      "-i", this.url,
      "-sn",
      // Video and audio in ONE graph, with the audio branch existing purely so
      // ebur128 has something to measure.
      //
      // Two mistakes are baked out of this line. `-af ebur128` alone does
      // nothing here: -af applies to the output's audio stream, and mapping only
      // video meant no audio output existed, so the filter was never
      // instantiated. And `ebur128=metadata=1` writes to frame metadata INSTEAD
      // of printing, so the periodic reports this parses never appear. Plain
      // `ebur128` at -loglevel info prints ~10 lines/sec of momentary loudness,
      // which is the signal `speaker` mode needs.
      "-filter_complex",
      `[0:v]fps=${config.captureFps},scale=${nw}:${nh}:flags=bilinear,` +
        `pad=${MODEL_SIZE}:${MODEL_SIZE}:${padX}:${padY}:black[v]` +
        (this.hasAudio ? `;[0:a]ebur128[a]` : ``),
      "-map", "[v]",
      "-pix_fmt", "rgba",
      "-f", "rawvideo",
      "-",
      // The audio branch goes nowhere — measured, then discarded. It must NOT
      // share stdout with the raw video. Omitted entirely on a silent source.
      ...(this.hasAudio ? ["-map", "[a]", "-f", "null", "/dev/null"] : []),
    ];

    const child = spawn(config.ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    this.child = child;
    this.lastFrameAt = Date.now();
    this.startWatchdog();

    child.stdout.on("data", (chunk: Buffer) => this.onBytes(chunk));
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      // ebur128 loudness reports share stderr with real errors. Consume the
      // former, and only treat what is left as a fault — otherwise every
      // loudness line would masquerade as an error and bury actual problems.
      const consumed = this.consumeLoudness(text);
      const remainder = consumed.trim();
      if (remainder && !remainder.startsWith("[Parsed_ebur128")) {
        this.lastError = remainder.slice(-500);
      }
    });
    child.once("error", (error) => {
      this.lastError = error.message;
      this.child = null;
      this.scheduleRestart();
    });
    child.once("exit", (code, signal) => {
      this.child = null;
      if (!this.stopped) {
        this.lastError = `ffmpeg exited ${code ?? signal}${this.lastError ? `: ${this.lastError}` : ""}`;
        this.scheduleRestart();
      }
    });
  }

  private onBytes(chunk: Buffer) {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);

    // Keep only the newest complete frame; drop anything older in the same burst.
    while (this.pending.length >= FRAME_BYTES) {
      const frameBuf = this.pending.subarray(0, FRAME_BYTES);
      this.pending = this.pending.subarray(FRAME_BYTES);
      const geo = this.geometry;
      if (!geo) continue;
      this.framesSeen += 1;
      this.lastFrameAt = Date.now();
      this.latest = {
        // Copy: `pending` is reused and subarray shares its memory, so holding
        // a view would let the next chunk rewrite the frame mid-inference.
        rgba: Uint8Array.from(frameBuf),
        letterbox: geo.letterbox,
        sourceWidth: geo.width,
        sourceHeight: geo.height,
        capturedAt: Date.now(),
      };
    }

    // A stream that desyncs must not grow the buffer without bound.
    if (this.pending.length > FRAME_BYTES * 4) {
      this.pending = this.pending.subarray(this.pending.length - FRAME_BYTES);
    }
  }

  private scheduleRestart() {
    if (this.stopped || this.restartTimer) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start();
    }, config.restartBackoffMs);
  }

  /** Point the puller at a different URL (MediaMTX handed out a new path). */
  retarget(url: string) {
    if (url === this.url) return;
    this.url = url;
    this.geometry = null;
    this.latest = null;
    this.pending = Buffer.alloc(0);
    this.child?.kill("SIGKILL");
    this.child = null;
    void this.start();
  }

  /**
   * Pull ebur128 momentary-loudness reports out of an stderr chunk, returning
   * whatever was NOT a loudness line so the caller can judge it as an error.
   *
   * Lines look like:
   *   [Parsed_ebur128_0 @ 0x..] t: 3.5  M: -23.4 S: -25.1 I: -24.0 LUFS ...
   * `M` is momentary loudness over the last 400ms — the right window for
   * "is someone talking right now", where integrated loudness would smear it.
   */
  private consumeLoudness(text: string): string {
    const kept: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const match = /\bM:\s*(-?\d+(?:\.\d+)?)/.exec(line);
      if (match && line.includes("ebur128")) {
        const value = Number.parseFloat(match[1]);
        // ffmpeg reports -70 (or lower) for digital silence.
        if (Number.isFinite(value)) {
          this.loudnessLufs = value;
          this.loudnessAt = Date.now();
        }
        continue;
      }
      if (line.trim()) kept.push(line);
    }
    return kept.join("\n");
  }

  /**
   * Loudness as a 0-100 scale, matching the telemetry contract's `audioPeak`.
   *
   * LUFS is logarithmic and negative: roughly -70 is silence and -10 is loud.
   * Mapped across that range rather than normalised against a rolling maximum,
   * so a quiet room reads as quiet instead of being stretched to look busy.
   * Returns 0 when no report has arrived recently — an unknown level must not
   * masquerade as a loud one.
   */
  /**
   * Momentary loudness as a 0-100 score, held and then decayed rather than
   * dropped.
   *
   * The old version returned 0 the instant the last ebur128 line was more than
   * maxAgeMs old. Measured on 2026-09-13, roughly a third of readings fell into
   * that gap — so one room reported 75, then 0, then 75 again within seconds
   * while nothing about it changed. The director scores SPEAKER mode directly
   * on this number, so a room oscillating between "loudest in the house" and
   * "silent" made it cut constantly. That flicker was the instability, not the
   * cameras.
   *
   * A cliff is the wrong shape for a scoring input. Stale data here means "we
   * have not heard recently", which is much closer to the last value than to
   * silence. So the reading holds for a grace window and then fades out, which
   * still lets a genuinely dead meter reach zero — just not between two
   * consecutive log lines.
   */
  audioLevel(maxAgeMs = AUDIO_HOLD_MS): number {
    if (this.loudnessLufs === null) return 0;

    const clamped = Math.max(-70, Math.min(-10, this.loudnessLufs));
    const level = ((clamped + 70) / 60) * 100;

    const age = Date.now() - this.loudnessAt;
    if (age <= maxAgeMs) return Math.round(level);

    const decayed = age - maxAgeMs;
    if (decayed >= AUDIO_DECAY_MS) return 0;
    return Math.round(level * (1 - decayed / AUDIO_DECAY_MS));
  }

  /**
   * True when ffmpeg is up but has gone quiet.
   *
   * The process dying is the easy failure and was already handled. The nasty
   * one is ffmpeg staying alive with a wedged input: no error, no exit, no
   * frames, forever. Nothing in the exit/error path can ever notice that.
   */
  private isStalled(): boolean {
    if (!this.child || !this.lastFrameAt) return false;
    return Date.now() - this.lastFrameAt > this.stallTimeoutMs();
  }

  /** Generous relative to the capture rate, so a slow segment is not a stall. */
  private stallTimeoutMs(): number {
    return Math.max(20_000, (1000 / Math.max(0.1, config.captureFps)) * 10);
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      if (this.stopped || !this.child) return;
      if (!this.isStalled()) return;
      this.lastError = `no frames for ${Math.round(
        (Date.now() - this.lastFrameAt) / 1000,
      )}s — restarting stalled ffmpeg`;
      console.warn(`[tank-vision] ${this.cameraId}: ${this.lastError}`);
      // Killing it routes into the existing exit handler, which schedules the
      // restart — one recovery path, not two.
      this.child.kill("SIGKILL");
    }, 5_000);
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }

  stop() {
    this.stopped = true;
    this.stopWatchdog();
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.child?.kill("SIGKILL");
    this.child = null;
    this.latest = null;
    this.pending = Buffer.alloc(0);
  }
}
