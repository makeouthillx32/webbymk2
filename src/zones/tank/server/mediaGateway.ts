import type { DiscoveredCamera, PlaybackProtocol, CameraPlayback } from "../contracts";
import {
  buildPublicCameraPlayback,
  buildPublicCameraPreview,
  cameraMediaPath,
  cameraHlsMediaPath,
  cameraHlsLowMediaPath,
  cameraPreviewMediaPath,
  cameraArchiveMediaPath,
  obsRoomMediaPath,
  obsRoomPreviewMediaPath,
} from "../mediaPlayback";

export type MediaGatewayProvisionResult = {
  ok: boolean;
  cameraId: string;
  path: string;
  playback: CameraPlayback;
  error?: string;
};

export function getPublicCameraPlayback(cameraId: string, online: boolean) {
  return buildPublicCameraPlayback(cameraId, online, {
    whepBaseUrl: process.env.TANK_WHEP_PUBLIC_BASE_URL,
    hlsBaseUrl: process.env.TANK_HLS_PUBLIC_BASE_URL,
  });
}

export function getPublicCameraPreview(cameraId: string, online: boolean) {
  return buildPublicCameraPreview(cameraId, online, {
    whepBaseUrl: process.env.TANK_WHEP_PUBLIC_BASE_URL,
  });
}

export { buildPublicCameraPlayback, cameraMediaPath, cameraHlsMediaPath } from "../mediaPlayback";

// Every camera the SRT Receiver Manager runs — SRTLA, direct SRT, or an
// RTSP camera bridged through it — ends up normalized to the same thing: a
// per-camera "video out" SRT listener on the manager host, documented in
// that tool's own readme as "SRT playback for OBS/VLC" (container port 4000,
// published per camera as `videoOutPort`). Playback still requires the
// receiver's `play/stream/<user>?srtauth=<key>` stream ID to select and
// authorize the publisher. Those values remain server-side and are never
// projected through Tank's public camera API.
export function buildManagerSrtSource(input: {
  lanHost: string;
  videoOutPort: number;
  streamUser: string;
  streamKey: string;
  /**
   * SRT's own retransmit buffer, in ms, for THIS leg (MediaMTX/ffmpeg as
   * player, pulling from the receiver). A wired LAN camera's default
   * (a few hundred ms) is fine; a bonded SRTLA phone link has the bursty,
   * uneven-quality loss pattern bonding exists to paper over in the first
   * place (confirmed live 2026-08-24: the two legs of one IRL session sat
   * at ~4 Mbps and ~500 kbps respectively) — too tight a buffer there
   * means a lost packet's retransmit doesn't arrive before playback needs
   * it, which is exactly what stutter sounds like. Belabox-style mobile
   * encoders standardize on multi-second latency for this reason.
   */
  latencyMs?: number;
}): string | null {
  if (
    !input.lanHost ||
    !Number.isInteger(input.videoOutPort) ||
    !input.streamUser ||
    !input.streamKey
  ) return null;
  const streamId = `play/stream/${input.streamUser}?srtauth=${input.streamKey}`;
  const latency = input.latencyMs ? `&latency=${input.latencyMs}` : "";
  return `srt://${input.lanHost}:${input.videoOutPort}?streamid=${streamId}&mode=caller${latency}`;
}

export function mediaMtxHeaders() {
  const token = process.env.MEDIAMTX_API_TOKEN;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type MediaMtxPathHealth = {
  ready: boolean;
  bytesReceived: number;
};

/**
 * The one signal that's actually true regardless of where a delivery
 * pipeline broke. Confirmed live, repeatedly, 2026-08-23/24: a camera or
 * an OBS room can show "connected"/"live" at the source level (real
 * inbound bitrate, a healthy publish) while MediaMTX has never received a
 * single byte on the path an actual viewer would hit — a downstream
 * player-attach failure, a wiped-on-restart path, a GPU decode error, or
 * (for OBS specifically) a WHEP sibling that never got provisioned at
 * all. "Connected" and "delivering footage" are different questions;
 * this answers the second one. Shared by the media-health diagnostic
 * route and any auto-recovery detector that needs the real answer rather
 * than a source-side presence flag.
 */
export async function readMediaMtxPathHealth(
  apiUrl: URL,
  path: string,
): Promise<MediaMtxPathHealth | null> {
  try {
    const response = await fetch(
      new URL(`/v3/paths/get/${encodeURIComponent(path)}`, apiUrl),
      { method: "GET", headers: mediaMtxHeaders(), cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as { ready?: boolean; bytesReceived?: number };
    return {
      ready: Boolean(body.ready),
      bytesReceived: Number(body.bytesReceived) || 0,
    };
  } catch {
    return null;
  }
}

export type MediaMtxProvisionOptions = {
  transcodeAudio?: boolean;
  externalAudioUrl?: string | null;
  /**
   * Skips the normal "read the path once to learn its codec" bootstrap
   * (readPathVideoCodec below) and forces the H.264 re-encode branch from
   * the very first provision. For a path that has never once come up
   * ready, that bootstrap can't run at all — chicken-and-egg — so a
   * caller who already knows the source is HEVC (a direct ffprobe pull
   * outside MediaMTX, say) can force it here instead of waiting for a
   * successful `-c:v copy` pass that will never happen.
   */
  forceVideoTranscode?: boolean;
  /** See hwDecodeFlags' comment — decode on the CPU while retaining hardware encoding. */
  forceSoftwareDecode?: boolean;
  /** Provision a 360p/12fps video-only roster rung (used for IRL cameras). */
  previewRung?: boolean;
};

// Every browser delivery path Tank uses requires H.264 video.
//
// WebRTC/WHEP does not negotiate HEVC in Chrome or Firefox at all, and the HLS
// sibling is MPEG-TS (hlsVariant: mpegts), which hls.js cannot carry HEVC in
// either. A camera publishing H.265 therefore connects, reports ready, streams
// real bytes — and renders a black frame in every viewer's browser. That is
// exactly how an IRL phone encoder defaulting to HEVC presents: online in the
// registry, no picture on the site.
const BROWSER_SAFE_VIDEO_CODECS = new Set(["H264", "AV1", "VP8", "VP9"]);

/**
 * Reads the codecs MediaMTX currently sees on a path.
 *
 * Returns null when the path does not exist yet or is not ready — on the very
 * first provision there is nothing to inspect, so the camera starts on copy and
 * the next poll upgrades it to a transcode if the codec turns out to need one.
 */
async function readPathVideoCodec(apiUrl: URL, path: string): Promise<string | null> {
  try {
    const response = await fetch(
      new URL(`/v3/paths/get/${encodeURIComponent(path)}`, apiUrl),
      { method: "GET", headers: mediaMtxHeaders(), cache: "no-store" },
    );
    if (!response.ok) return null;
    const body = await response.json() as { ready?: boolean; tracks?: string[] };
    if (!body.ready || !Array.isArray(body.tracks)) return null;
    // Tracks are reported as bare codec names, e.g. ["H265", "Opus"].
    return body.tracks.find((t) => /^(H26[45]|AV1|VP[89])$/i.test(t)) ?? null;
  } catch {
    return null;
  }
}


// ── Video encoder selection ─────────────────────────────────────────────────
//
// Every rung below used to hardcode libx264. Measured on this host (RTX 4080
// SUPER) against a LIVE 4K camera, 20s of footage:
//
//   software decode + libx264            12.88 CPU seconds
//   software decode + h264_nvenc         10.72   (encode offloaded only)
//   NVDEC + scale_cuda + h264_nvenc       5.21   (whole pipeline on GPU)
//
// The middle row is the important one: moving only the ENCODE to the GPU buys
// about 17%, because decoding 4K in software is what actually costs. The win
// requires keeping frames on the GPU end to end — hence the hwaccel flags and
// scale_cuda below, not just a different -c:v.
//
// (A synthetic 720p benchmark shows ~10x for the encode alone. That number is
// real and completely misleading for this workload, because testsrc has no
// decode step. Do not tune against it.)
//
// Gated on an explicit env var rather than probing for a GPU: a silent
// fallback would make a misconfigured host look merely slow instead of
// misconfigured, and this is the setting most likely to need a fast rollback.
// Requires the NVENC-capable image (mediamtx/Dockerfile.nvenc) — the stock
// Alpine image has no nvenc encoders at all.
type EncoderTuning = {
  /** Latency-sensitive live rungs. */
  live: (bitrate: string, extra?: string) => string;
  /** Archive rungs, where a little latency is free. */
  archive: (bitrate: string) => string;
};

export function hwEncoderEnabled(): boolean {
  return process.env.TANK_HW_ENCODER === "nvenc";
}

/**
 * Archive codec. AV1 is ~40% smaller for the same quality, which is what makes
 * multi-day retention fit on one disk — but Safari can only decode it on
 * hardware that supports AV1 (Apple silicon M3+/A17 Pro and later), so an older
 * iPhone cannot play an AV1 archive at all. H.264 stays the default for that
 * reason; AV1 is opt-in per deployment.
 */
export function archiveCodec(): "av1" | "h264" {
  return process.env.TANK_ARCHIVE_CODEC === "av1" ? "av1" : "h264";
}

/**
 * Input flags that keep decoded frames in GPU memory.
 *
 * Must be paired with a CUDA-aware filter (scale_cuda); a CPU filter like
 * plain `scale` cannot read a CUDA frame and ffmpeg fails outright rather than
 * falling back, so these two always change together.
 */
// forceSoftware is an escape hatch for a specific source, not a global
// toggle — NVDEC's HEVC decoder isn't guaranteed to handle every stream
// every encoder produces. Confirmed live 2026-08-24: a phone's HEVC/SRTLA
// stream failed NVDEC decode with "Function not implemented" while
// software decode of the identical stream works. One IRL camera on
// software decode costs nothing worth caring about; it exists so a single
// bad source doesn't force every fixed 4K camera off the GPU with it.
export function hwDecodeFlags(forceSoftware?: boolean): string {
  return hwEncoderEnabled() && !forceSoftware ? " -hwaccel cuda -hwaccel_output_format cuda" : "";
}

/** Scale filter matching wherever the frames currently live. */
export function scaleFilter(height: number, forceSoftware?: boolean): string {
  return hwEncoderEnabled() && !forceSoftware ? `scale_cuda=-2:${height}` : `scale=-2:${height}`;
}

export function encoderTuning(): EncoderTuning {
  if (!hwEncoderEnabled()) {
    return {
      live: (bitrate, extra = "") =>
        `-c:v libx264 -preset veryfast -tune zerolatency -b:v ${bitrate}` +
        ` -maxrate ${bitrate} -bufsize ${bitrate} -g 60 -keyint_min 60 -sc_threshold 0` +
        ` -x264-params no-scenecut=1:keyint=60:min-keyint=60${extra}`,
      archive: (bitrate) =>
        `-c:v libx264 -preset veryfast -b:v ${bitrate}` +
        ` -maxrate ${bitrate} -bufsize ${bitrate} -g 60 -keyint_min 60 -sc_threshold 0`,
    };
  }

  return {
    // p4 is NVENC's balanced preset and `ll` its low-latency tune — the direct
    // analogues of veryfast + zerolatency. CBR keeps the bitrate predictable
    // for WebRTC, which has no way to buffer around a spike.
    live: (bitrate, extra = "") =>
      `-c:v h264_nvenc -preset p4 -tune ll -rc cbr -b:v ${bitrate}` +
      ` -maxrate ${bitrate} -bufsize ${bitrate} -g 60 -keyint_min 60 -no-scenecut 1 -strict_gop 1${extra}`,
    archive: (bitrate) => {
      const codec = archiveCodec() === "av1" ? "av1_nvenc" : "h264_nvenc";
      return `-c:v ${codec} -preset p4 -rc vbr -b:v ${bitrate}` +
        ` -maxrate ${bitrate} -bufsize ${bitrate} -g 60 -keyint_min 60 -no-scenecut 1`;
    },
  };
}

/** A deliberately tiny, fast-joining thumbnail encode. Never use this for the
 * selected hero; it trades detail and frame rate for a bounded card budget. */
export function previewEncoderTuning(): string {
  if (hwEncoderEnabled()) {
    return "-c:v h264_nvenc -preset p4 -tune ll -rc cbr -b:v 450k" +
      " -maxrate 550k -bufsize 900k -g 24 -keyint_min 24 -no-scenecut 1 -strict_gop 1";
  }
  return "-c:v libx264 -preset veryfast -tune zerolatency -b:v 450k" +
    " -maxrate 550k -bufsize 900k -g 24 -keyint_min 24 -sc_threshold 0" +
    " -x264-params no-scenecut=1:keyint=24:min-keyint=24";
}

export function buildPreviewSiblingCommand(sourcePath: string, previewPath: string): string {
  return `ffmpeg -nostdin -hide_banner -loglevel warning${hwDecodeFlags()}` +
    ` -rtsp_transport tcp -i rtsp://127.0.0.1:8554/${sourcePath}` +
    ` -map 0:v:0 -an -vf ${scaleFilter(360)} -r 12 ${previewEncoderTuning()}` +
    ` -fps_mode cfr -rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/${previewPath}`;
}

export async function teardownCameraPreview(cameraId: string): Promise<void> {
  const apiBase = process.env.MEDIAMTX_API_URL;
  if (!apiBase) return;
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
  } catch {
    return;
  }
  await upsertMediaMtxPath(apiUrl, cameraPreviewMediaPath(cameraId), {
    source: "publisher",
    sourceOnDemand: false,
    runOnInit: "",
  }).catch(() => {});
}

// Written into the normalising ffmpeg command so a later poll can tell "this
// path is H.264 because we are re-encoding it" apart from "this camera
// publishes H.264 natively". RTSP output ignores the metadata entirely.
const VIDEO_NORMALIZE_MARKER = "tank_vnorm=h264";

/**
 * Whether the path is ALREADY configured to normalise video.
 *
 * Reads the stored config rather than the live tracks on purpose: once
 * normalisation is on, the tracks report our H.264 output, so a codec probe
 * would say "nothing to do", revert the path to copy, and immediately see the
 * camera's H.265 again — flapping the stream on every poll.
 */
async function isPathVideoNormalized(apiUrl: URL, path: string): Promise<boolean> {
  try {
    const response = await fetch(
      new URL(`/v3/config/paths/get/${encodeURIComponent(path)}`, apiUrl),
      { method: "GET", headers: mediaMtxHeaders(), cache: "no-store" },
    );
    if (!response.ok) return false;
    const body = await response.json() as { runOnInit?: unknown };
    return typeof body.runOnInit === "string" && body.runOnInit.includes(VIDEO_NORMALIZE_MARKER);
  } catch {
    return false;
  }
}

export function needsVideoTranscode(codec: string | null): boolean {
  if (!codec) return false;
  return !BROWSER_SAFE_VIDEO_CODECS.has(codec.toUpperCase());
}

// Registers (or updates) a camera's path with MediaMTX so it starts
// republishing as WHEP/HLS. Called automatically from receiverManager.ts
// whenever a camera reports online with a resolvable source — this is the
// piece that makes the 25-camera rollout "just work" as cameras get added
// in the SRT Receiver Manager, with no per-camera file edits anywhere.
export async function provisionMediaMtxCamera(
  cameraId: string,
  sourceUrl: string | null,
  options?: MediaMtxProvisionOptions,
): Promise<MediaGatewayProvisionResult> {
  const path = cameraMediaPath(cameraId);
  const playback = getPublicCameraPlayback(cameraId, true);
  const apiBase = process.env.MEDIAMTX_API_URL;

  if (!apiBase || !sourceUrl) {
    return {
      ok: false,
      cameraId,
      path,
      playback,
      error: !apiBase
        ? "MEDIAMTX_API_URL is not configured."
        : "No resolvable source for this camera yet.",
    };
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
    if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") throw new Error();
  } catch {
    return { ok: false, cameraId, path, playback, error: "Media gateway API URL is invalid." };
  }

  const hlsPath = cameraHlsMediaPath(cameraId);
  const lowPath = cameraHlsLowMediaPath(cameraId);

  // What the camera is actually publishing right now. Null on first
  // provision (nothing to read yet); the next poll re-evaluates.
  const [publishedVideoCodec, alreadyNormalized] = await Promise.all([
    readPathVideoCodec(apiUrl, path),
    isPathVideoNormalized(apiUrl, path),
  ]);
  // Sticky: a path already normalising stays normalising. Re-deriving the
  // answer from its own output would flap the stream every poll.
  const transcodeVideo = alreadyNormalized || needsVideoTranscode(publishedVideoCodec) || Boolean(options?.forceVideoTranscode);

  // Any video normalisation forces the ffmpeg path, even for a camera whose
  // audio needs nothing — there is no way to re-encode video with `source: url`.
  const isTranscoding = Boolean(
    options?.transcodeAudio || options?.externalAudioUrl || transcodeVideo,
  );

  // Decode and encode are separate decisions. Some phone HEVC streams cannot
  // be decoded by NVDEC, but their CPU-decoded frames can still be handed to
  // NVENC. The old forceSoftwareTranscode flag accidentally forced libx264 as
  // well, running three software video encoders for one IRL source.
  const tuning = encoderTuning();
  const videoOut = transcodeVideo
    ? `${tuning.live("4000k")} -pix_fmt yuv420p -fps_mode passthrough` +
      ` -metadata:s:v:0 ${VIDEO_NORMALIZE_MARKER}`
    : "-c:v copy";
  // Single-pass EBU R128 loudness normalization combined with monotonic audio resampling.
  // aresample=async=1000 ensures audio PTS stays monotonic without backwards-in-time drift
  // during SRT/RTSP jitter or packet retransmission, preventing HLS audio segment corruption.
  const audioFilter = "aresample=async=1000:min_hard_comp=0.100000:first_pts=0,loudnorm=I=-16:TP=-1.5:LRA=11";

  // The source process publishes the WHEP path and optional 720p rung. HLS is
  // a lightweight sidecar below: it copies the already-normalized H.264 video
  // from the WHEP path and transcodes only Opus -> AAC. Previously the source
  // command repeated videoOut for WHEP and HLS, which made ffmpeg perform two
  // identical full-resolution video encodes plus the low rung. For an IRL
  // source on the software-decode escape hatch, that contention caused visible
  // stutter even while SRT and MediaMTX byte delivery stayed healthy.
  // Use TCP interleaved transport for local RTSP publish into MediaMTX.
  // Using UDP locally causes FU-A packet drops and non-starting NAL units
  // during heavy video bursts, corrupting keyframes for HLS/WHEP clients.
  const rtspOut = (p: string) => `-rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/${p}`;

  // ABR low rung — 720p. Requires hardware acceleration or explicit TANK_HLS_LOW_RUNG=1
  // to avoid CPU saturation across multiple 4K raw camera streams.
  const lowRungEnabled = process.env.TANK_HLS_LOW_RUNG === "1";
  const lowOut = lowRungEnabled
    ? ` -map 0:v:0 -map 0:a:0? -vf ${scaleFilter(720, options?.forceSoftwareDecode)} ${tuning.live("1500k")} -fps_mode passthrough` +
      ` -af ${audioFilter} -c:a aac -b:a 96k ${rtspOut(lowPath)}`
    : "";

  const ffmpegBase = `ffmpeg -hide_banner -loglevel warning${hwDecodeFlags(options?.forceSoftwareDecode)} -probesize 10M -analyzeduration 2M -fflags +genpts+discardcorrupt -avoid_negative_ts make_zero`;

  let runOnInitCmd = "";
  if (options?.externalAudioUrl) {
    runOnInitCmd =
      `${ffmpegBase} -i "${sourceUrl}" -i "${options.externalAudioUrl}"` +
      ` -map 0:v:0 -map 1:a:0? ${videoOut} -af ${audioFilter} -c:a libopus -b:a 64k ${rtspOut(path)}` +
      lowOut;
  } else if (options?.transcodeAudio) {
    runOnInitCmd =
      `${ffmpegBase} -i "${sourceUrl}"` +
      ` -map 0:v:0 -map 0:a:0? ${videoOut} -af ${audioFilter} -c:a libopus -b:a 64k ${rtspOut(path)}` +
      lowOut;
  } else if (transcodeVideo) {
    // Video needs normalising but the audio is already browser-safe, so it is
    // re-encoded to the container-appropriate codec without a filter pass.
    runOnInitCmd =
      `${ffmpegBase} -i "${sourceUrl}"` +
      ` -map 0:v:0 -map 0:a:0? ${videoOut} -c:a libopus -b:a 64k ${rtspOut(path)}` +
      lowOut;
  }

  // Reuse the normalized H.264 bitstream. Transcoded main paths carry Opus for
  // WHEP, so only their audio is converted to AAC; direct paths already carry
  // HLS-safe audio and remain a pure remux.
  const hlsAudioOut = isTranscoding ? "-c:a aac -b:a 128k" : "-c:a copy";
  const hlsRunOnInitCmd =
    `ffmpeg -hide_banner -loglevel warning -rtsp_transport tcp` +
    ` -i rtsp://127.0.0.1:8554/${path}` +
    ` -map 0:v:0 -map 0:a:0? -c:v copy ${hlsAudioOut} ${rtspOut(hlsPath)}`;

  // The HLS sibling has to exist BEFORE the main path's ffmpeg starts —
  // that process publishes into it, and MediaMTX refuses a publish to a
  // path it doesn't know about.
  const hlsResult = await upsertMediaMtxPath(apiUrl, hlsPath, {
    source: "publisher",
    sourceOnDemand: false,
    runOnInit: hlsRunOnInitCmd,
    runOnInitRestart: true,
  });

  // Low rung receives from the main path's ffmpeg (same ordering reason as
  // the AAC sibling), so it only exists while the ladder is enabled.
  if (lowRungEnabled) {
    await upsertMediaMtxPath(apiUrl, lowPath, {
      source: "publisher",
      sourceOnDemand: false,
      runOnInit: "",
    });
  }

  const targetSource = isTranscoding ? "publisher" : sourceUrl;
  // Mobile/SRTLA cameras have a dedicated 360p preview sibling. Let that path
  // own the recent clip so the worker can remux it without another decode or
  // encode. Fixed cameras do not keep a permanent preview encoder, so their
  // main path owns the GPU-downscaled clip instead.
  const readyHook = options?.previewRung
    ? "TANK_CLIP_ENABLED=0 /bin/sh /scripts/on-preview-ready.sh"
    : "/bin/sh /scripts/on-preview-ready.sh";
  const bodyObj: Record<string, unknown> = {
    source: targetSource,
    sourceOnDemand: false,
    runOnReady: readyHook,
    runOnReadyRestart: true,
  };
  if (isTranscoding && runOnInitCmd) {
    bodyObj.runOnInit = runOnInitCmd;
    bodyObj.runOnInitRestart = true;
  } else {
    bodyObj.runOnInit = "";
  }

  const mainResult = await upsertMediaMtxPath(apiUrl, path, bodyObj);

  if (!mainResult.ok) {
    return {
      ok: false,
      cameraId,
      path,
      playback,
      error: `Media gateway rejected the camera path (${mainResult.status}): ${mainResult.error ?? "no response body"}`,
    };
  }

  if (options?.previewRung) {
    const previewPath = cameraPreviewMediaPath(cameraId);
    const previewResult = await upsertMediaMtxPath(apiUrl, previewPath, {
      source: "publisher",
      sourceOnDemand: false,
      runOnInit: buildPreviewSiblingCommand(path, previewPath),
      runOnInitRestart: true,
      runOnReady: "/bin/sh /scripts/on-preview-ready.sh",
      runOnReadyRestart: true,
    });
    if (!previewResult.ok) {
      console.warn(
        `[mediaGateway] preview rung not provisioned for ${cameraId} (${previewResult.status ?? "unknown"}) — hero playback unaffected`,
      );
    }
  }

  // Archive rung last: it pulls the main path over local RTSP, so that path
  // has to be live first. A failing archive must never take down delivery, so
  // its result is logged and dropped rather than failing provisioning.
  const archiveResult = await provisionArchiveRung(apiUrl, cameraId, getArchiveRungConfig());
  if (!archiveResult.ok) {
    console.warn(
      `[mediaGateway] archive rung not provisioned for ${cameraId} (${archiveResult.status ?? "unknown"}) — live playback unaffected`,
    );
  }

  // A failed HLS sibling is degraded, not fatal — WebRTC viewers are
  // unaffected, so report the camera as provisioned and surface the reason
  // rather than blackholing a feed that does work for most clients.
  if (!hlsResult.ok) {
    return {
      ok: true,
      cameraId,
      path,
      playback,
      error: `HLS variant unavailable (${hlsResult.status}) — WebRTC playback unaffected.`,
    };
  }

  return { ok: true, cameraId, path, playback };
}

/**
 * Provisions the WHEP-ready Opus sibling for a live OBS/RTMP room — see the
 * long comment on buildObsRoomPlayback in ../mediaPlayback.ts for why this
 * has to be a separate path rather than a transcode of the room's own path:
 * OBS is the active publisher there, so nothing else can rewrite it in
 * place. Called from server/obsRooms.ts's setObsRoomSignal the moment a room
 * goes live — by then the raw obs/<slug> path is already publishing, which
 * this ffmpeg needs to have something to pull.
 */
export async function provisionObsWhepSibling(slug: string): Promise<{ ok: boolean; error?: string }> {
  const apiBase = process.env.MEDIAMTX_API_URL;
  if (!apiBase) return { ok: false, error: "MEDIAMTX_API_URL is not configured." };
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
  } catch {
    return { ok: false, error: "Media gateway API URL is invalid." };
  }

  const rawPath = obsRoomMediaPath(slug);
  const whepPath = `${rawPath}-whep`;
  const previewPath = obsRoomPreviewMediaPath(slug);

  const runOnInitCmd = buildObsWhepSiblingCommand(rawPath, whepPath);

  const result = await upsertMediaMtxPath(apiUrl, whepPath, {
    source: "publisher",
    sourceOnDemand: false,
    runOnInit: runOnInitCmd,
    runOnInitRestart: true,
  });
  if (!result.ok) {
    return { ok: false, error: `MediaMTX rejected the OBS WHEP sibling (${result.status ?? "unknown"}).` };
  }

  // Pull from the already-normalized 1080p sibling rather than decoding the
  // broadcaster's raw 4K contribution a second time.
  const previewResult = await upsertMediaMtxPath(apiUrl, previewPath, {
    source: "publisher",
    sourceOnDemand: false,
    runOnInit: buildPreviewSiblingCommand(whepPath, previewPath),
    runOnInitRestart: true,
    runOnReady: "/bin/sh /scripts/on-preview-ready.sh",
    runOnReadyRestart: true,
  });
  return previewResult.ok
    ? { ok: true }
    : { ok: true, error: `OBS preview rung unavailable (${previewResult.status ?? "unknown"}); hero remains live.` };
}

/**
 * Builds the always-hot browser delivery sibling for an OBS room.
 *
 * OBS publishers are allowed to arrive with any GOP length. Copying that GOP
 * into WHEP made a newly attached viewer wait for the publisher's next IDR;
 * the live Admin stream measured an 8.33 second GOP on 2026-08-24, while the
 * browser abandoned WHEP after only a few seconds and then paid the HLS startup
 * cost too. When NVENC is available, normalise the sibling to 1080p with the
 * same fixed two-second GOP used by Tank's other live rungs. The sibling stays
 * hot for the life of the OBS publish, so viewers attach to an already-running
 * low-latency stream instead of inheriting the broadcaster's join latency.
 *
 * The non-NVENC fallback deliberately retains video copy. A surprise 4K x264
 * encode in the MediaMTX container would be worse than the slower join it is
 * intended to fix; deployments without the GPU get the client-side extended
 * first-frame deadline instead.
 */
export function buildObsWhepSiblingCommand(rawPath: string, whepPath: string): string {
  const input = hwEncoderEnabled()
    ? `${hwDecodeFlags()} -rtsp_transport tcp -i rtsp://127.0.0.1:8554/${rawPath}`
    : ` -rtsp_transport tcp -i rtsp://127.0.0.1:8554/${rawPath}`;
  const video = hwEncoderEnabled()
    ? `-vf ${scaleFilter(1080)} ${encoderTuning().live("4500k")} -fps_mode passthrough`
    : `-c:v copy`;

  return `ffmpeg -nostdin -hide_banner -loglevel warning${input}` +
    ` -map 0:v:0 -map 0:a:0? ${video} -c:a libopus -b:a 64k` +
    ` -rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/${whepPath}`;
}

/** Stands the WHEP sibling down when a room goes offline, so its ffmpeg stops error-looping against a dead source instead of being left to retry forever. */
export async function teardownObsWhepSibling(slug: string): Promise<void> {
  const apiBase = process.env.MEDIAMTX_API_URL;
  if (!apiBase) return;
  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
  } catch {
    return;
  }
  const whepPath = `${obsRoomMediaPath(slug)}-whep`;
  const previewPath = obsRoomPreviewMediaPath(slug);
  await Promise.all([
    upsertMediaMtxPath(apiUrl, whepPath, {
      source: "publisher",
      sourceOnDemand: false,
      runOnInit: "",
    }),
    upsertMediaMtxPath(apiUrl, previewPath, {
      source: "publisher",
      sourceOnDemand: false,
      runOnInit: "",
    }),
  ]).catch(() => {});
}

export type ArchiveRungConfig = {
  enabled: boolean;
  /** Video bitrate for the recorded rung. ~3 Mbps 1080p ≈ 32 GB/camera/day. */
  bitrate: string;
  /** How much footage goes in one file. 10m at 3 Mbps ≈ 225 MB. */
  segmentDuration: string;
  /**
   * How long a segment survives in the LOCAL spool. This is a retry buffer,
   * not the archive — the 24h archive lives in Supabase Storage. At 6 cameras
   * x 3 Mbps the spool grows ~8 GB/hour, so keep this small.
   */
  spoolRetention: string;
};

export function getArchiveRungConfig(): ArchiveRungConfig {
  return {
    // Archiving is disabled. Batch 01 (chunked 10m/15m segments) failed the 24-hour continuous archive test.
    // Chunked segmentation is decommissioned until full 24-hour daily timeline aggregation is built.
    enabled: false,
    bitrate: process.env.TANK_ARCHIVE_BITRATE || "3000k",
    segmentDuration: process.env.TANK_ARCHIVE_SEGMENT_DURATION || "24h",
    spoolRetention: process.env.TANK_ARCHIVE_SPOOL_RETENTION || "2h",
  };
}

/**
 * Calculates a staggered segment duration for a camera to prevent synchronized
 * upload bursts. When multiple cameras share an identical duration (e.g. 10m),
 * all segment boundaries and Supabase uploads trigger at the exact same second,
 * producing 400%+ CPU and network spikes.
 *
 * Assigning a deterministic ±45s offset per camera (e.g. 555s, 570s, 585s, 600s, 615s, 630s, 645s)
 * ensures segment completion windows drift apart naturally and disperse upload load evenly.
 */
export function calculateStaggeredSegmentDuration(
  cameraId?: string,
  baseDurationStr: string = "10m",
): string {
  let baseSeconds = 600;
  const match = baseDurationStr.match(/^(\d+)([smh]?)$/i);
  if (match) {
    const val = parseInt(match[1], 10);
    const unit = (match[2] || "s").toLowerCase();
    if (unit === "m") baseSeconds = val * 60;
    else if (unit === "h") baseSeconds = val * 3600;
    else baseSeconds = val;
  }

  if (!cameraId) {
    return `${baseSeconds}s`;
  }

  let hash = 0;
  for (let i = 0; i < cameraId.length; i++) {
    hash = (hash << 5) - hash + cameraId.charCodeAt(i);
    hash |= 0;
  }

  const offsets = [-45, -30, -15, 0, 15, 30, 45];
  const offset = offsets[Math.abs(hash) % offsets.length];
  const staggeredSeconds = Math.max(60, baseSeconds + offset);

  return `${staggeredSeconds}s`;
}

// Provisions the continuous-archive rung for one camera.
//
// Unlike the 720p ladder rung, this runs as its own ffmpeg pulling the already
// normalized main path over local RTSP rather than being appended to the
// camera's runOnInit command. That costs one extra decode per camera (~1 core,
// measured against the 4.2 cores the existing four low rungs use), and buys
// uniformity: every camera gets recorded on identical terms whether or not its
// audio needed transcoding. Coverage matters more than cores for an archive.
async function provisionArchiveRung(
  apiUrl: URL,
  cameraId: string,
  config: ArchiveRungConfig,
): Promise<{ ok: boolean; status?: number }> {
  const mainPath = cameraMediaPath(cameraId);
  const archivePath = cameraArchiveMediaPath(cameraId);

  if (!config.enabled) {
    // Explicitly stand the rung down rather than leaving whatever was there:
    // flipping the flag off must actually stop the disk filling.
    return upsertMediaMtxPath(apiUrl, archivePath, {
      source: "publisher",
      sourceOnDemand: false,
      runOnInit: "",
      record: false,
    });
  }

  const staggeredDuration = calculateStaggeredSegmentDuration(cameraId, config.segmentDuration);

  // Two ways to fill the archive, and the choice is a hardware budget, not a
  // preference. This GPU allows 12 concurrent NVENC sessions; six low rungs
  // already hold six of them, so a 1080p archive encode per camera consumes
  // the remaining six and leaves nothing for anything else — including the
  // director program mixer, which needs one.
  //
  // Copying the existing 720p low rung costs ZERO encoder sessions and almost
  // no CPU, at the price of archiving at 720p rather than 1080p.
  const archiveFromLowRung = process.env.TANK_ARCHIVE_SOURCE !== "transcode";

  const encode = archiveFromLowRung
    ? // Straight remux of a stream that is already H.264 720p with AAC audio.
      // No decode, no encode, no filter graph — just bytes into a file.
      `ffmpeg -nostdin -hide_banner -loglevel warning -rtsp_transport tcp` +
      ` -i rtsp://127.0.0.1:8554/${cameraHlsLowMediaPath(cameraId)}` +
      ` -map 0:v:0 -map 0:a:0? -c:v copy -c:a copy` +
      ` -rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/${archivePath}`
    : `ffmpeg -nostdin -hide_banner -loglevel warning${hwDecodeFlags()} -rtsp_transport tcp` +
      ` -i rtsp://127.0.0.1:8554/${mainPath}` +
      ` -map 0:v:0 -map 0:a:0? -vf ${scaleFilter(1080)}` +
      ` ${encoderTuning().archive(config.bitrate)} -fps_mode passthrough` +
      ` -c:a aac -b:a 128k` +
      ` -rtsp_transport tcp -f rtsp rtsp://127.0.0.1:8554/${archivePath}`;

  return upsertMediaMtxPath(apiUrl, archivePath, {
    source: "publisher",
    sourceOnDemand: false,
    runOnInit: encode,
    runOnInitRestart: true,
    record: true,
    recordFormat: "fmp4",
    recordPath: "/recordings/%path/%Y-%m-%d_%H-%M-%S-%f",
    recordSegmentDuration: staggeredDuration,
    // MediaMTX expires the local copy on its own. The upload hook has this
    // long to succeed or retry before the bytes are gone locally.
    recordDeleteAfter: config.spoolRetention,
    runOnRecordSegmentComplete: "/scripts/on-segment-complete.sh",
  });
}

// Polling the receiver directory happens every few seconds. Re-PATCHing an
// unchanged path makes MediaMTX reload its configuration and tears down the
// active SRT pull, producing a visible disconnect/reconnect loop. Read the
// current path first and mutate only when it is absent or actually changed.
async function upsertMediaMtxPath(
  apiUrl: URL,
  path: string,
  bodyObj: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const encoded = encodeURIComponent(path);

  const currentResponse = await fetch(
    new URL(`/v3/config/paths/get/${encoded}`, apiUrl),
    { method: "GET", headers: mediaMtxHeaders(), cache: "no-store" },
  );
  if (currentResponse.ok) {
    const current = await currentResponse.json() as Record<string, unknown>;
    // Compare EVERY key being sent, not just source/runOnInit. The archive rung
    // carries record settings that can change while the source stays identical
    // (segment duration, retention, toggling recording off) — a two-field
    // comparison would report "unchanged" and silently never apply them.
    const unchanged = Object.keys(bodyObj).every((key) => {
      const desired = bodyObj[key];
      const actual = current[key];
      if (typeof desired === "string" || typeof actual === "string") {
        return (actual ?? "") === (desired ?? "");
      }
      return actual === desired;
    });
    if (unchanged) return { ok: true };
  }

  const body = JSON.stringify(bodyObj);
  const patchResponse = await fetch(
    new URL(`/v3/config/paths/patch/${encoded}`, apiUrl),
    { method: "PATCH", headers: mediaMtxHeaders(), body, cache: "no-store" },
  );

  // A MediaMTX restart wipes every dynamically-added path (nothing here is
  // persisted to disk) — so a "path doesn't exist yet" PATCH after a
  // restart is the NORMAL case, not an edge case, and it doesn't reliably
  // come back as 404. Confirmed live 2026-08-24: cam-irl-1's PATCH came
  // back 400, not 404, right after unt_mediamtx restarted, so the old
  // `=== 404` check never tried the ADD fallback and just failed outright
  // — while every other camera happened to get 404 and self-healed via
  // that fallback, making this look camera-specific when it wasn't. Any
  // non-ok PATCH now tries ADD; if the path is genuinely broken, ADD fails
  // too and its own response is what gets reported instead of hiding
  // behind the PATCH's specific status code.
  let response = patchResponse;
  if (!patchResponse.ok) {
    response = await fetch(new URL(`/v3/config/paths/add/${encoded}`, apiUrl), {
      method: "POST",
      headers: mediaMtxHeaders(),
      body,
      cache: "no-store",
    });
  }

  if (response.ok) return { ok: true, status: response.status };

  const errorText = await response.text().catch(() => "");
  return { ok: false, status: response.status, error: errorText || undefined };
}
