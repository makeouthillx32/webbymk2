function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function float(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function list(name: string): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  /**
   * Where readings go. The shared-secret ingest route documents itself as being
   * for "an external detector … a standalone process" — that is exactly this
   * worker, so nothing downstream (atlas, director, matrix) needs to change:
   * it lands in the same in-memory telemetry store the browser engine posts to.
   */
  tankBaseUrl: (process.env.TANK_BASE_URL?.trim() || "http://unt_tank:3000").replace(/\/$/, ""),
  ingestSecret: required("TANK_ARCHIVE_INGEST_SECRET"),

  /** MediaMTX, for HLS playback paths and readiness. */
  mediamtxApiUrl: (process.env.MEDIAMTX_API_URL?.trim() || "http://mediamtx:9997").replace(/\/$/, ""),
  mediamtxHlsUrl: (process.env.MEDIAMTX_HLS_URL?.trim() || "http://mediamtx:8888").replace(/\/$/, ""),
  mediamtxApiToken: process.env.MEDIAMTX_API_TOKEN?.trim() || null,

  modelPath: process.env.TANK_VISION_MODEL_PATH?.trim() || "./models/yolov8n.onnx",
  ffmpegPath: process.env.TANK_VISION_FFMPEG_PATH?.trim() || "ffmpeg",

  workerId: process.env.TANK_VISION_WORKER_ID?.trim() || `tank-vision-${crypto.randomUUID()}`,

  /** How often the camera roster is re-read from Supabase. */
  rosterRefreshMs: integer("TANK_VISION_ROSTER_REFRESH_MS", 30_000, 5_000, 600_000),
  /** Frames per second pulled per camera. Inference is the bottleneck, not this. */
  captureFps: float("TANK_VISION_CAPTURE_FPS", 1, 0.1, 10),
  /**
   * Gap between inference passes. One camera is inferred per pass, round-robin:
   * a single wasm session is not reentrant, and sweeping all six at once just
   * queues them behind each other while inflating apparent latency.
   */
  inferenceIntervalMs: integer("TANK_VISION_INFERENCE_INTERVAL_MS", 600, 100, 60_000),
  /** Wasm threads for the ONNX session. 1 is the safe default under Bun. */
  wasmThreads: integer("TANK_VISION_WASM_THREADS", 1, 1, 16),

  /** Only these room scopes are observed. Empty = every online camera. */
  roomAllowList: list("TANK_VISION_ROOMS"),
  /** Cameras never to observe, whatever the roster says. */
  cameraDenyList: list("TANK_VISION_CAMERA_DENY"),

  /** A frame older than this is stale; the camera is reported as unobserved. */
  frameStaleMs: integer("TANK_VISION_FRAME_STALE_MS", 15_000, 1_000, 300_000),
  /** Restart backoff for an ffmpeg puller that dies. */
  restartBackoffMs: integer("TANK_VISION_RESTART_BACKOFF_MS", 3_000, 500, 120_000),

  logDetections: process.env.TANK_VISION_LOG_DETECTIONS !== "0",

  /**
   * The operator's graded person gallery, exported by
   * services/tank-vision-gpu/tools/export_worker_gallery.py (worker-person.*).
   * Unset: people are named by the old appearance histogram. Reloaded on change.
   */
  galleryDir: process.env.TANK_GALLERY_DIR?.trim() || null,
};

export type VisionConfig = typeof config;
