"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

// Real person detection for the director's scoring engine.
//
// VirtualCanvas already draws detection boxes from whatever telemetry it's
// handed, and the director engine already scores cameras against real
// numbers the moment 2+ cameras report — neither of those needed building.
// What was missing was a producer: nothing ever ran actual detection and
// posted the result. This is that producer. It runs entirely in this staff
// member's own browser tab against hidden video elements it creates itself
// (not the visible CameraPlayer instances — kept separate deliberately, so a
// frame-sampling bug here can never affect what a viewer sees), and POSTs
// real readings to the staff-authenticated telemetry endpoint every couple
// of seconds. Runs only while a staff member has the director-configuration
// page open, which is the same "operator's console does the work" model the
// rest of this system already assumes (see directorTelemetryStore.ts's own
// comments).
//
// Migrated 2026-08-25 from TensorFlow.js + COCO-SSD (SSD-MobileNetV2) to
// onnxruntime-web running a pretrained YOLOv8n, exported once offline
// (`yolo export model=yolov8n.pt format=onnx imgsz=640`, no training
// involved — the pretrained COCO weights already know "person"). Chosen over
// the `@ultralytics/yolo` convenience wrapper deliberately: that package was
// v0.0.38 and two and a half months old at the time, versus onnxruntime-web
// itself at v1.29.0, Microsoft-maintained, 21k+ GitHub stars — the wrapper
// wasn't mature enough to build on, the underlying runtime is. Same external
// contract as before (peopleCount + normalized boundingBoxes posted to
// /api/tank/director/telemetry/live), so nothing downstream — VirtualCanvas,
// directorTelemetryStore, serverDirectorEngine — needed to change.

export type DetectionCameraInput = {
  id: string;
  /** The camera's WHEP or HLS playback URL, whichever receiverManager gave it. */
  playbackUrl: string;
};

const TICK_MS = 2000;
const MIN_SCORE = 0.5;
const MAX_DETECTIONS = 20;
const IOU_THRESHOLD = 0.45;

const MODEL_URL = "/models/yolov8n.onnx";
const MODEL_INPUT_NAME = "images";
const MODEL_SIZE = 640; // Confirmed against the exported model: input [1,3,640,640].
const NUM_ANCHORS = 8400; // Confirmed against the exported model: output0 [1,84,8400].
const PERSON_CLASS_INDEX = 0; // COCO class 0. Channels 4..83 in output0 are the 80 class scores.

type LetterboxInfo = { scale: number; padX: number; padY: number };

/**
 * Resizes into the model's square input while preserving aspect ratio
 * (black-padding the rest) instead of stretching — stretching a 16:9 camera
 * frame into a square distorts people just enough to measurably hurt
 * detection accuracy. Returns what's needed to map boxes back out of the
 * padded/scaled space and onto the real video frame.
 */
function letterboxFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): LetterboxInfo {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = Math.min(MODEL_SIZE / vw, MODEL_SIZE / vh);
  const nw = Math.round(vw * scale);
  const nh = Math.round(vh * scale);
  const padX = Math.floor((MODEL_SIZE - nw) / 2);
  const padY = Math.floor((MODEL_SIZE - nh) / 2);

  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  ctx.drawImage(video, 0, 0, vw, vh, padX, padY, nw, nh);

  return { scale, padX, padY };
}

/** RGBA canvas pixels -> planar (CHW) float32, normalized 0-1, the shape ONNX Runtime expects. */
function frameToTensor(ctx: CanvasRenderingContext2D): Float32Array {
  const { data } = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
  const plane = MODEL_SIZE * MODEL_SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const j = i * 4;
    out[i] = data[j] / 255; // R plane
    out[plane + i] = data[j + 1] / 255; // G plane
    out[2 * plane + i] = data[j + 2] / 255; // B plane
  }
  return out;
}

type Box = { x1: number; y1: number; x2: number; y2: number; score: number };

function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

/** Standard greedy NMS — YOLO's raw output has many overlapping boxes per real object. */
function nonMaxSuppression(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const box of sorted) {
    if (kept.every((k) => iou(k, box) < IOU_THRESHOLD)) kept.push(box);
    if (kept.length >= MAX_DETECTIONS) break;
  }
  return kept;
}

/**
 * output0 is [1, 84, 8400] — channel-major, not per-anchor rows: reading
 * anchor `a` of channel `c` is `data[c * NUM_ANCHORS + a]`. Channels 0-3 are
 * box center-x/y/w/h in the padded 640-space; channels 4-83 are the 80 COCO
 * class scores, already the final per-class probability (Ultralytics' ONNX
 * export bakes that in — no separate sigmoid/objectness step needed here).
 */
function parseYoloOutput(
  data: Float32Array,
  letterbox: LetterboxInfo,
  videoWidth: number,
  videoHeight: number,
): Array<{ nx: number; ny: number; nw: number; nh: number; label: string }> {
  const { scale, padX, padY } = letterbox;
  const candidates: Box[] = [];

  for (let a = 0; a < NUM_ANCHORS; a++) {
    const score = data[(4 + PERSON_CLASS_INDEX) * NUM_ANCHORS + a];
    if (score < MIN_SCORE) continue;

    const cx = data[0 * NUM_ANCHORS + a];
    const cy = data[1 * NUM_ANCHORS + a];
    const w = data[2 * NUM_ANCHORS + a];
    const h = data[3 * NUM_ANCHORS + a];

    // Undo the letterbox pad/scale to land back in the real frame's pixels.
    candidates.push({
      x1: (cx - w / 2 - padX) / scale,
      y1: (cy - h / 2 - padY) / scale,
      x2: (cx + w / 2 - padX) / scale,
      y2: (cy + h / 2 - padY) / scale,
      score,
    });
  }

  return nonMaxSuppression(candidates).map((b) => {
    const x1 = Math.max(0, b.x1);
    const y1 = Math.max(0, b.y1);
    const x2 = Math.min(videoWidth, b.x2);
    const y2 = Math.min(videoHeight, b.y2);
    return {
      nx: x1 / videoWidth,
      ny: y1 / videoHeight,
      nw: (x2 - x1) / videoWidth,
      nh: (y2 - y1) / videoHeight,
      label: "person",
    };
  });
}

/**
 * Every real camera's WHEP URL has an HLS sibling at `<id>-hls/index.m3u8`
 * (see cameraHlsMediaPath in mediaPlayback.ts) — detection doesn't care about
 * sub-second latency, so HLS is the simpler, more broadly-decodable source
 * for a background hidden <video>, same reasoning CameraPlayer uses for its
 * own WHEP-to-HLS fallback derivation.
 */
function deriveDetectionHlsUrl(playbackUrl: string): string {
  return playbackUrl.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    "/$1-hls/index.m3u8",
  );
}

type Loaded = {
  video: HTMLVideoElement;
  hls: Hls | null;
};

export function PeopleDetectionEngine({ cameras }: { cameras: DetectionCameraInput[] }) {
  const [modelReady, setModelReady] = useState(false);
  // Any type: onnxruntime-web's InferenceSession type isn't worth importing
  // just for a ref, and the module itself is dynamically imported below.
  const sessionRef = useRef<any>(null);
  const ortRef = useRef<any>(null);
  const loadedRef = useRef<Map<string, Loaded>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load the model once. Dynamic import keeps onnxruntime-web's real weight
  // out of every other page — this component only ever mounts on the
  // director-configuration screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ort = await import("onnxruntime-web");
        // The bundler can't resolve onnxruntime-web's WASM binaries through
        // Next.js's asset pipeline reliably (a well-documented gotcha with
        // this package under webpack/Turbopack) — point it at the matching
        // version on a CDN instead of trying to bundle/copy them ourselves.
        ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";
        const session = await ort.InferenceSession.create(MODEL_URL, {
          // Tries WebGPU first for near-native framerates on hardware that
          // supports it, automatically falling back to multi-threaded WASM
          // where it doesn't (Safari's WebGPU support is still inconsistent).
          executionProviders: ["webgpu", "wasm"],
        });
        if (cancelled) return;
        ortRef.current = ort;
        sessionRef.current = session;
        setModelReady(true);
      } catch (error) {
        console.error("[PeopleDetectionEngine] Failed to load detection model:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep one hidden <video> (+ its own hls.js instance) per requested camera,
  // adding/removing as the online camera list changes.
  useEffect(() => {
    const loaded = loadedRef.current;
    const wantedIds = new Set(cameras.map((c) => c.id));

    for (const [id, entry] of loaded) {
      if (wantedIds.has(id)) continue;
      entry.hls?.destroy();
      entry.video.pause();
      entry.video.remove();
      loaded.delete(id);
    }

    for (const cam of cameras) {
      if (loaded.has(cam.id)) continue;
      const hlsUrl = deriveDetectionHlsUrl(cam.playbackUrl);

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;";
      document.body.appendChild(video);

      let hls: Hls | null = null;
      if (Hls.isSupported()) {
        hls = new Hls({ maxBufferLength: 4, liveSyncDurationCount: 1 });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
      } else {
        video.src = hlsUrl;
      }
      void video.play().catch(() => {});

      loaded.set(cam.id, { video, hls });
    }
  }, [cameras]);

  // Full teardown on unmount — leaving hidden video elements decoding video
  // after a staff member navigates away would just burn CPU and bandwidth
  // for nothing.
  useEffect(() => {
    return () => {
      for (const entry of loadedRef.current.values()) {
        entry.hls?.destroy();
        entry.video.pause();
        entry.video.remove();
      }
      loadedRef.current.clear();
    };
  }, []);

  // The detection loop itself.
  useEffect(() => {
    if (!modelReady) return;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let cancelled = false;
    let ticking = false;

    const tick = async () => {
      // A tick overrunning its own interval (a slow frame, a stalled camera)
      // must not stack a second tick on top of it.
      if (ticking) return;
      ticking = true;
      try {
        const ort = ortRef.current;
        const session = sessionRef.current;
        if (!ort || !session) return;

        const readings: Array<Record<string, unknown>> = [];

        for (const [cameraId, entry] of loadedRef.current) {
          const { video } = entry;
          if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) continue;

          try {
            const letterbox = letterboxFrame(video, canvas, ctx);
            const tensorData = frameToTensor(ctx);
            const tensor = new ort.Tensor("float32", tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
            const output = await session.run({ [MODEL_INPUT_NAME]: tensor });
            const raw = output.output0.data as Float32Array;

            const boundingBoxes = parseYoloOutput(raw, letterbox, video.videoWidth, video.videoHeight);

            readings.push({
              cameraId,
              peopleCount: boundingBoxes.length,
              motionScore: 0,
              audioPeak: 0,
              isSpeaking: false,
              boundingBoxes,
            });
          } catch (error) {
            // One camera's frame failing to decode/infer must not take the
            // rest of the house down with it.
            console.warn(`[PeopleDetectionEngine] detection failed for ${cameraId}:`, error);
          }
        }

        if (!cancelled && readings.length > 0) {
          await fetch("/api/tank/director/telemetry/live", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cameras: readings }),
          }).catch(() => {});
        }
      } finally {
        ticking = false;
      }
    };

    void tick();
    const interval = setInterval(tick, TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [modelReady]);

  return null;
}

export default PeopleDetectionEngine;
