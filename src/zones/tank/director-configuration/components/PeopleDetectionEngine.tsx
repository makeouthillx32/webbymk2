"use client";

import { useEffect, useRef, useState } from "react";
import { TANK_HLS_ANALYSIS } from "@/zones/tank/public/hlsTuning";
import Hls from "hls.js";
import {
  computeLetterbox,
  MODEL_SIZE,
  parseYoloOutput,
  rgbaToTensor,
  type LetterboxInfo,
} from "@/zones/tank/vision/decode";
import { trackMotion, type PriorBox } from "@/zones/tank/vision/motion";
import { getLiveVideo } from "../liveFrameRegistry";

// Real person detection for the director's scoring engine.
//
// VirtualCanvas already draws detection boxes from whatever telemetry it's
// handed, and the director engine already scores cameras against real
// numbers the moment 2+ cameras report — neither of those needed building.
// What was missing was a producer: nothing ever ran actual detection and
// posted the result. This is that producer. It runs entirely in this staff
// member's own browser tab and POSTs real readings to the staff-authenticated
// telemetry endpoint every couple of seconds.
//
// FRAME SOURCE, changed 2026-09-11. This used to open its own hidden <video>
// per camera, deliberately separate from the visible CameraPlayer instances so
// that a frame-sampling bug could never affect what a viewer sees. That
// reasoning is still correct for a PUBLIC page — and wrong here. On the
// operator console the operator IS the viewer, there is no audience to
// protect, and the cost was brutal: six visible tiles plus six hidden videos
// meant the console decoded every camera TWICE, twelve live decodes competing
// for one hardware decoder, which is why the director stuttered while the
// public page running half as many stayed smooth.
//
// So it now samples the matrix tile that is already decoding each camera (see
// ../liveFrameRegistry.ts) and opens a hidden video ONLY for a camera with no
// tile on screen. Sampling is read-only — drawImage off a playing video cannot
// disturb playback — and the footage is better besides, since the tiles carry
// the full source rung. Runs only while a staff member has the director-configuration
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
/** How often to re-check whether the server-side worker is producing. */
const SERVER_PROBE_MS = 5000;

const MODEL_URL = "/models/yolov8n.onnx";
const MODEL_INPUT_NAME = "images";

/**
 * Draws a video frame into the model's square input, preserving aspect ratio
 * and black-padding the remainder.
 *
 * This is the only genuinely DOM-bound step in browser detection: the maths
 * lives in the shared decoder, and all this adds is the canvas draw. The
 * server-side worker does the same job with ffmpeg instead of a canvas and
 * then calls the identical `rgbaToTensor` / `parseYoloOutput`, so the two
 * observers cannot drift into disagreeing about what was in frame.
 */
function letterboxFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): LetterboxInfo {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const info = computeLetterbox(vw, vh);
  const nw = Math.round(vw * info.scale);
  const nh = Math.round(vh * info.scale);

  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  ctx.drawImage(video, 0, 0, vw, vh, info.padX, info.padY, nw, nh);

  return info;
}

/** Canvas pixels -> the planar CHW float32 tensor ONNX Runtime expects. */
function frameToTensor(ctx: CanvasRenderingContext2D): Float32Array {
  return rgbaToTensor(ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data);
}

/**
 * Every real camera's WHEP URL has an HLS sibling at `<id>-hls/index.m3u8`
 * (see cameraHlsMediaPath in mediaPlayback.ts) — detection doesn't care about
 * sub-second latency, so HLS is the simpler, more broadly-decodable source
 * for a background hidden <video>, same reasoning CameraPlayer uses for its
 * own WHEP-to-HLS fallback derivation.
 */
function deriveDetectionHlsUrl(playbackUrl: string, rung: "low" | "full" = "low"): string {
  const suffix = rung === "low" ? "-hls-low" : "-hls";
  return playbackUrl.replace(
    /\/(cameras\/[^/]+?)(?:-hls(?:-low)?)?\/(?:whep|index\.m3u8)(\?.*)?$/,
    `/$1${suffix}/index.m3u8`,
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
  const prevBoxesRef = useRef<Map<string, PriorBox[]>>(new Map());
  // Round-robin cursor and the last reading computed for each camera.
  //
  // The loop used to infer EVERY camera back to back inside one tick. Six
  // cameras at a few hundred ms each is well over a second of solid main-thread
  // work every two seconds, in the same tab that is decoding and painting the
  // live feeds — which is most of why the director stuttered while the public
  // page stayed smooth. Now one camera is inferred per tick and the others
  // re-post their last reading, which is the same decoupling the server worker
  // uses (see services/tank-vision-worker/src/observer.ts).
  // Whether the server-side worker is currently producing. While it is, this
  // engine does nothing: no hidden streams, no inference, no posting. It resumes
  // on its own if the worker goes quiet, so a dead worker degrades to the old
  // browser-side behaviour instead of leaving the director blind.
  const [serverDetecting, setServerDetecting] = useState(false);
  const camerasRef = useRef<DetectionCameraInput[]>([]);
  camerasRef.current = cameras;
  const cursorRef = useRef(0);
  const lastReadingRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  // Is the server-side worker alive? Polled on its own slow timer — this must
  // keep running while the engine is stood down, or it could never notice the
  // worker dying and take back over.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/tank/director/telemetry/live", { cache: "no-store" });
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setServerDetecting(Boolean(body?.serverDetectionActive));
      } catch {
        // Unreachable telemetry is not evidence the worker is gone; leave the
        // current decision alone rather than thrashing between producers.
      }
    };
    void check();
    const timer = setInterval(check, SERVER_PROBE_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Load the model once. Dynamic import keeps onnxruntime-web's real weight
  // out of every other page — this component only ever mounts on the
  // director-configuration screen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let modelBuffer: ArrayBuffer | null = null;
        try {
          const res = await fetch(MODEL_URL);
          if (res.ok) {
            const ct = res.headers.get("content-type") || "";
            if (!ct.includes("text/html")) {
              modelBuffer = await res.arrayBuffer();
            }
          }
        } catch {}

        if (!modelBuffer || cancelled) {
          if (!modelBuffer) {
            console.warn("[PeopleDetectionEngine] Model file /models/yolov8n.onnx unavailable, skipping browser-side AI inference.");
          }
          return;
        }

        // Re-check before the expensive part: if the worker came up while the
        // checkpoint was downloading, there is no reason to build a session.
        if (cancelled) return;

        const ort = await import("onnxruntime-web");
        // The bundler can't resolve onnxruntime-web's WASM binaries through
        // Next.js's asset pipeline reliably (a well-documented gotcha with
        // this package under webpack/Turbopack) — point it at the matching
        // version on a CDN instead of trying to bundle/copy them ourselves.
        ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/";
        const session = await ort.InferenceSession.create(modelBuffer, {
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
        console.warn("[PeopleDetectionEngine] Detection model init skipped:", error);
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
    // Stood down: release every hidden stream. Holding them open would keep
    // decoding for a detector that is not running.
    const wantedIds = serverDetecting ? new Set<string>() : new Set(cameras.map((c) => c.id));

    for (const [id, entry] of loaded) {
      if (wantedIds.has(id)) continue;
      entry.hls?.destroy();
      entry.video.pause();
      entry.video.remove();
      loaded.delete(id);
    }

    if (serverDetecting) return;

    for (const cam of cameras) {
      if (loaded.has(cam.id)) continue;

      // The matrix tile for this camera is already decoding it. Opening a
      // second stream for the same feed is what made the console decode every
      // camera twice; sample the tile instead and open nothing.
      if (getLiveVideo(cam.id)) continue;

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;";
      document.body.appendChild(video);

      let hls: Hls | null = null;
      if (Hls.isSupported()) {
        // Machine vision, not eyes: the freshest frame matters and a stutter
        // costs nothing. Never the viewer profile — see hlsTuning.ts.
        hls = new Hls({ ...TANK_HLS_ANALYSIS });

        // Start on the LOW rung and fall back to full only if it will not load.
        //
        // Measured 2026-09-11: the full rung is 3840x2160 and the low rung is
        // 1280x720 — nine times fewer pixels to decode. Detection letterboxes
        // every frame to 640x640 before inference, so the 4K detail is thrown
        // away immediately; decoding it was pure cost. With six hidden videos
        // in the same tab as the visible players, that was ~50 megapixels per
        // frame of invisible video competing with the feeds the operator is
        // actually watching, which is why the director stuttered while the
        // public Tank page did not.
        //
        // Fallback is necessary, not defensive: only 3 of 6 low rungs were
        // ready when this was written, so a hard switch would blind half the
        // house.
        let usingLow = true;
        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data?.fatal || !usingLow) return;
          usingLow = false;
          const full = deriveDetectionHlsUrl(cam.playbackUrl, "full");
          console.warn(
            `[PeopleDetectionEngine] low rung unavailable for ${cam.id}; falling back to full res`,
          );
          hls?.loadSource(full);
          void video.play().catch(() => {});
        });

        hls.loadSource(deriveDetectionHlsUrl(cam.playbackUrl, "low"));
        hls.attachMedia(video);
      } else {
        video.src = deriveDetectionHlsUrl(cam.playbackUrl, "low");
      }
      void video.play().catch(() => {});

      loaded.set(cam.id, { video, hls });
    }
  }, [cameras, serverDetecting]);

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
    // The worker is producing — no inference, no posting. Its readings are
    // already in the same store this would write to.
    if (serverDetecting) return;
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

        // Resolve every requested camera to a frame source, preferring the
        // matrix tile already decoding it and falling back to this engine's own
        // hidden video for cameras with no tile on screen.
        const sources = camerasRef.current
          .map((cam) => ({
            cameraId: cam.id,
            video: getLiveVideo(cam.id) ?? loadedRef.current.get(cam.id)?.video ?? null,
          }))
          .filter((entry): entry is { cameraId: string; video: HTMLVideoElement } =>
            entry.video !== null,
          );
        if (sources.length === 0) return;

        // One camera per tick, in rotation.
        const index = cursorRef.current % sources.length;
        cursorRef.current = (cursorRef.current + 1) % sources.length;
        const due = [sources[index]];

        for (const { cameraId, video } of due) {
          if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) continue;

          try {
            const letterbox = letterboxFrame(video, canvas, ctx);
            const tensorData = frameToTensor(ctx);
            const tensor = new ort.Tensor("float32", tensorData, [1, 3, MODEL_SIZE, MODEL_SIZE]);
            const output = await session.run({ [MODEL_INPUT_NAME]: tensor });
            const raw = output.output0.data as Float32Array;

            const rawBoxes = parseYoloOutput(raw, letterbox, video.videoWidth, video.videoHeight);
            const now = Date.now();

            // Shared with the server-side observer, so both compute movement
            // the same way — see src/zones/tank/vision/motion.ts.
            const { boxes: boundingBoxes, nextPriors } = trackMotion(
              rawBoxes,
              prevBoxesRef.current.get(cameraId) ?? [],
              now,
            );
            prevBoxesRef.current.set(cameraId, nextPriors);

            lastReadingRef.current.set(cameraId, {
              cameraId,
              // Was boundingBoxes.length — correct only while every box was a
              // person. Now that dog/cat share the same array, a pet in
              // frame would have inflated the person count.
              peopleCount: boundingBoxes.filter((b) => b.label === "person").length,
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

        // Post EVERY camera's latest reading, not just the one re-inferred.
        // The store expires a reading after TELEMETRY_TTL_MS (4s); with one
        // camera inferred per 2s tick a six-camera house would take 12s to come
        // round, so anything not re-posted would age out and the director would
        // keep going blind. Re-posting is nearly free, inference is not.
        const wanted = new Set(camerasRef.current.map((c) => c.id));
        for (const id of lastReadingRef.current.keys()) {
          if (!wanted.has(id)) lastReadingRef.current.delete(id);
        }
        const readings = [...lastReadingRef.current.values()];

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
  }, [modelReady, serverDetecting]);

  return null;
}

export default PeopleDetectionEngine;
