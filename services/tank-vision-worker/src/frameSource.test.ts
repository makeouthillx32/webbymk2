import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The worker's config reads required env at import time. These are never used
// by the code under test — no Supabase call, no telemetry post happens here —
// but they have to exist before ./config is pulled in transitively.
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.TANK_ARCHIVE_INGEST_SECRET ||= "test-ingest-secret";
process.env.TANK_VISION_CAPTURE_FPS ||= "5";

const { FRAME_BYTES, FramePuller, probeStream } = await import("./frameSource");
const { computeLetterbox, MODEL_SIZE } = await import("../../../src/zones/tank/vision/decode");

// Why this test exists: ffmpeg applies the letterbox, the decoder undoes it, and
// nothing connects them but arithmetic agreeing across a process boundary. If
// the pad landed even a couple of pixels off, every box would be quietly
// mis-placed and no error would ever be raised — the detections would simply be
// a bit wrong forever. So this asserts on the actual pixels ffmpeg produced.

const FFMPEG = process.env.TANK_VISION_FFMPEG_PATH || "ffmpeg";
const SOURCE_WIDTH = 1280;
const SOURCE_HEIGHT = 720;

let dir: string;
let clipPath: string;
let ffmpegAvailable = true;

function run(cmd: string, args: string[], timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], shell: false });
    let stderr = "";
    child.stderr.on("data", (c) => { stderr = (stderr + String(c)).slice(-2_000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr}`));
    });
  });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "tank-vision-"));
  clipPath = join(dir, "source.mp4");
  try {
    // A 2s 1280x720 clip of solid white. Solid colour is the point: after the
    // letterbox, content pixels are unmistakably white and pad pixels are
    // unmistakably black, so the boundary is measurable to the pixel.
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi",
      "-i", `color=c=white:s=${SOURCE_WIDTH}x${SOURCE_HEIGHT}:r=10:d=2`,
      "-pix_fmt", "yuv420p",
      "-y", clipPath,
    ]);
  } catch (error) {
    ffmpegAvailable = false;
    console.warn(`[frameSource.test] ffmpeg unavailable, skipping: ${String(error)}`);
  }
});

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("probeStream", () => {
  test("reads the source's real dimensions", async () => {
    if (!ffmpegAvailable) return;
    const probed = await probeStream(clipPath);
    expect(probed.width).toBe(SOURCE_WIDTH);
    expect(probed.height).toBe(SOURCE_HEIGHT);
  });

  test("rejects a source it cannot read rather than inventing dimensions", async () => {
    if (!ffmpegAvailable) return;
    await expect(probeStream(join(dir, "does-not-exist.mp4"), 10_000)).rejects.toThrow();
  });
});

describe("FramePuller produces frames the decoder can undo", () => {
  test("frames are exactly MODEL_SIZE² RGBA, letterboxed where we said", async () => {
    if (!ffmpegAvailable) return;

    const puller = new FramePuller("test-cam", clipPath);
    await puller.start();

    // Poll rather than sleep blindly: ffmpeg has to open the file, decode, and
    // push a full frame through the pipe.
    let frame = null;
    for (let i = 0; i < 80; i++) {
      frame = puller.takeLatest(60_000);
      if (frame) break;
      await Bun.sleep(100);
    }
    puller.stop();

    expect(frame).not.toBeNull();
    if (!frame) return;

    expect(frame.rgba.length).toBe(FRAME_BYTES);
    expect(frame.sourceWidth).toBe(SOURCE_WIDTH);
    expect(frame.sourceHeight).toBe(SOURCE_HEIGHT);

    // The geometry the decoder will use to map boxes back.
    const expected = computeLetterbox(SOURCE_WIDTH, SOURCE_HEIGHT);
    expect(frame.letterbox).toEqual(expected);
    expect(expected.padX).toBe(0);
    expect(expected.padY).toBe(140);

    const px = (x: number, y: number) => {
      const i = (y * MODEL_SIZE + x) * 4;
      return [frame.rgba[i], frame.rgba[i + 1], frame.rgba[i + 2]];
    };

    // THE ASSERTION THAT MATTERS: the pad band ffmpeg wrote must be exactly
    // where computeLetterbox says it is. Row 0 and the last row are pad; the
    // centre is content.
    const [r0] = px(MODEL_SIZE / 2, 0);
    const [rPadEdge] = px(MODEL_SIZE / 2, expected.padY - 1);
    const [rContentTop] = px(MODEL_SIZE / 2, expected.padY + 2);
    const [rCentre] = px(MODEL_SIZE / 2, MODEL_SIZE / 2);
    const [rBottom] = px(MODEL_SIZE / 2, MODEL_SIZE - 1);

    expect(r0).toBeLessThan(16); // pad: black
    expect(rPadEdge).toBeLessThan(16); // last pad row, still black
    expect(rContentTop).toBeGreaterThan(200); // first content rows: white
    expect(rCentre).toBeGreaterThan(200);
    expect(rBottom).toBeLessThan(16); // bottom pad: black again
  }, 30_000);

  test("a puller pointed at nothing reports the error instead of hanging", async () => {
    if (!ffmpegAvailable) return;
    const puller = new FramePuller("broken-cam", join(dir, "missing.mp4"));
    await puller.start();
    expect(puller.takeLatest()).toBeNull();
    expect(puller.stats.framesSeen).toBe(0);
    expect(puller.stats.lastError).not.toBeNull();
    puller.stop();
  }, 30_000);
});

describe("audio level holds instead of cliffing to zero", () => {
  // The director scores SPEAKER mode straight off this number. Measured on
  // 2026-09-13, about a third of readings landed in the staleness gap, so one
  // room reported 75, then 0, then 75 within seconds while nothing about it
  // changed — and the director cut every time. The flicker was the instability,
  // not the cameras.

  const withLoudness = (lufs: number, ageMs: number) => {
    const puller = new FramePuller("cam-test", "http://example.test/x.m3u8");
    // Reach past the interface deliberately: there is no way to feed ebur128
    // output in a unit test, and the decay maths is the whole point.
    (puller as unknown as { loudnessLufs: number | null }).loudnessLufs = lufs;
    (puller as unknown as { loudnessAt: number }).loudnessAt = Date.now() - ageMs;
    return puller;
  };

  test("a fresh reading reports its real level", () => {
    expect(withLoudness(-25, 0).audioLevel()).toBeGreaterThan(60);
  });

  test("a reading a few seconds old does NOT collapse to zero", () => {
    // This is the regression. Previously anything past 5s read 0.
    expect(withLoudness(-25, 6_000).audioLevel()).toBeGreaterThan(60);
  });

  test("a stale reading fades rather than dropping", () => {
    const fresh = withLoudness(-25, 0).audioLevel();
    const fading = withLoudness(-25, 14_000).audioLevel();
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(fresh);
  });

  test("a genuinely dead meter still reaches zero", () => {
    // The hold must not become "claims the room is loud forever".
    expect(withLoudness(-25, 60_000).audioLevel()).toBe(0);
  });

  test("no reading at all is zero, not a guess", () => {
    const puller = new FramePuller("cam-test", "http://example.test/x.m3u8");
    expect(puller.audioLevel()).toBe(0);
  });

  test("silence reports zero even when fresh", () => {
    expect(withLoudness(-70, 0).audioLevel()).toBe(0);
  });
});
