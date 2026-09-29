import { readFile } from "node:fs/promises";
import {
  MODEL_SIZE,
  parseYoloOutput,
  rgbaToTensor,
  type LetterboxInfo,
  type NormalizedDetection,
} from "../../../src/zones/tank/vision/decode";
import { config } from "./config";

/**
 * The YOLOv8n session, running headless.
 *
 * This is `onnxruntime-web`, not `onnxruntime-node`, and that is deliberate
 * rather than a leftover from the browser engine. Verified under Bun
 * 1.3.14 on 2026-09-09: `typeof window` and `typeof document` are both
 * `undefined`, the session builds from the same 12.9 MB checkpoint in ~283ms,
 * and `output0` comes back `[1,84,8400]` — the exact shape the shared decoder
 * expects. The wasm backend needs no DOM, so the server-side observer needs no
 * native N-API addon, which matters because this image runs Bun and a prebuilt
 * `.node` binary would be a standing compatibility risk for no benefit.
 *
 * One consequence worth knowing: a wasm session is not reentrant. Callers must
 * serialise their `run` calls, which is why the worker infers one camera per
 * pass instead of sweeping all of them concurrently.
 */
const MODEL_INPUT_NAME = "images";

export type VisionSession = {
  infer(
    rgba: Uint8Array,
    letterbox: LetterboxInfo,
    sourceWidth: number,
    sourceHeight: number,
  ): Promise<NormalizedDetection[]>;
};

export async function createVisionSession(): Promise<VisionSession> {
  const ort: any = await import("onnxruntime-web");
  ort.env.wasm.numThreads = config.wasmThreads;
  // Nothing here fetches the wasm binaries over HTTP — they resolve from the
  // installed package on disk, which is the whole point of running locally.
  ort.env.logLevel = "error";

  const bytes = await readFile(config.modelPath);
  const session = await ort.InferenceSession.create(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    { executionProviders: ["wasm"] },
  );

  if (!session.inputNames.includes(MODEL_INPUT_NAME)) {
    throw new Error(
      `Model input "${MODEL_INPUT_NAME}" not found; got [${session.inputNames.join(", ")}]`,
    );
  }

  let busy = false;

  return {
    async infer(rgba, letterbox, sourceWidth, sourceHeight) {
      if (busy) throw new Error("Vision session is already running an inference.");
      busy = true;
      try {
        const tensor = new ort.Tensor("float32", rgbaToTensor(rgba), [
          1,
          3,
          MODEL_SIZE,
          MODEL_SIZE,
        ]);
        const output = await session.run({ [MODEL_INPUT_NAME]: tensor });
        const raw = output.output0.data as Float32Array;
        return parseYoloOutput(raw, letterbox, sourceWidth, sourceHeight);
      } finally {
        busy = false;
      }
    },
  };
}
