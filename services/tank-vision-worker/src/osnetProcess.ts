/**
 * OSNet-AIN in its own PROCESS, so naming never slows detection.
 *
 * It started as a Worker thread, but a second onnxruntime-web (wasm) instance in
 * the same Bun process hangs forever once the detector's session exists (the
 * first request never returned, reproduced in the container 2026-09-19). A child
 * process shares nothing with the detector; galleryNamer.ts spawns it over Bun
 * IPC and respawns it if it ever exits.
 *
 * Receives { id, tensor } (a 1x3x256x128 float32 crop from cropToTensor) and
 * answers { id, embedding } (L2-normalised 512 floats) or { id, error }.
 */

const modelPath = process.env.TANK_VISION_REID_MODEL_PATH?.trim() || "./models/osnet_ain_x1_0.onnx";
const threads = Math.max(1, Number.parseInt(process.env.TANK_VISION_REID_THREADS ?? "1", 10) || 1);

const ready = (async () => {
  const ort: any = await import("onnxruntime-web");
  ort.env.wasm.numThreads = threads;
  ort.env.logLevel = "error";
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ["wasm"] });
  return { ort, session };
})();

// One request at a time: a wasm session is not reentrant.
let chain: Promise<void> = Promise.resolve();

process.on("message", (message: { id: number; tensor: Float32Array }) => {
  chain = chain.then(async () => {
    const { id, tensor } = message;
    try {
      const { ort, session } = await ready;
      const out = await session.run({ input: new ort.Tensor("float32", tensor, [1, 3, 256, 128]) });
      const raw = out.embedding.data as Float32Array;
      let norm = 0;
      for (let k = 0; k < raw.length; k++) norm += raw[k] * raw[k];
      norm = Math.sqrt(norm) || 1;
      const embedding = new Float32Array(raw.length);
      for (let k = 0; k < raw.length; k++) embedding[k] = raw[k] / norm;
      process.send?.({ id, embedding });
    } catch (error) {
      process.send?.({ id, error: error instanceof Error ? error.message : String(error) });
    }
  });
});
