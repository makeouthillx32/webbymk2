// Diagnostic: what does the model actually believe, BELOW the MIN_SCORE floor?
//
// A reported "none" has two very different causes — the frame is genuinely
// empty, or something is there and scored under the threshold. Only the raw
// per-anchor maxima distinguish them, so this prints the best score for each
// watched class regardless of MIN_SCORE.
import { spawn } from "node:child_process";
import { computeLetterbox, MODEL_SIZE, rgbaToTensor, DETECTED_CLASSES, NUM_ANCHORS } from "../../../src/zones/tank/vision/decode";
import { probeStream } from "./frameSource";
import { config } from "./config";

function grab(path: string, nw: number, nh: number, padX: number, padY: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath, [
      "-hide_banner", "-loglevel", "error", "-i", path, "-frames:v", "1",
      "-vf", `scale=${nw}:${nh}:flags=bilinear,pad=${MODEL_SIZE}:${MODEL_SIZE}:${padX}:${padY}:black`,
      "-pix_fmt", "rgba", "-f", "rawvideo", "-",
    ], { stdio: ["ignore", "pipe", "pipe"], shell: false });
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c) => { err += String(c); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg ${code}: ${err}`)));
  });
}

const ort: any = await import("onnxruntime-web");
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";
const session = await ort.InferenceSession.create(await Bun.file(config.modelPath).arrayBuffer(), {
  executionProviders: ["wasm"],
});

for (const url of process.argv.slice(2)) {
  try {
    const { width, height } = await probeStream(url);
    const lb = computeLetterbox(width, height);
    const frame = await grab(url, Math.round(width * lb.scale), Math.round(height * lb.scale), lb.padX, lb.padY);

    // Mean luminance: a dark room is a plausible reason for a weak reading.
    let lum = 0;
    for (let i = 0; i < frame.length; i += 4) lum += (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
    lum /= frame.length / 4;

    const t = new ort.Tensor("float32", rgbaToTensor(frame), [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const data = (await session.run({ images: t })).output0.data as Float32Array;

    const best: Record<string, number> = {};
    for (const [idx, label] of Object.entries(DETECTED_CLASSES)) {
      let m = 0;
      for (let a = 0; a < NUM_ANCHORS; a++) {
        const s = data[(4 + Number(idx)) * NUM_ANCHORS + a];
        if (s > m) m = s;
      }
      best[label] = m;
    }
    const name = url.replace(/.*cameras\//, "").replace(/-hls.*/, "");
    console.log(
      `${name}  ${width}x${height}  mean-luma ${lum.toFixed(1)}  ` +
        Object.entries(best).map(([l, s]) => `${l}:${s.toFixed(3)}`).join("  "),
    );
  } catch (e) {
    console.log(`${url} FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
}
process.exit(0);
