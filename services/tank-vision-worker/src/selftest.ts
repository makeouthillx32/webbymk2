// Self-test: the whole pipeline against real images, with no stack running.
//
//   bun src/selftest.ts <image-or-video> [...]
//
// ffmpeg decode -> letterbox -> tensor -> YOLOv8n -> decoded boxes. The unit
// tests cover the decoder against synthetic tensors, which proves the maths but
// cannot catch a channel-order mistake: swapping R and B satisfies every shape
// assertion while quietly costing accuracy. So each input is run both ways and
// the two are printed side by side — RGB should win.
//
// Measured 2026-09-09 on public/ sample photos: hero-image-01 gave 5 people in
// RGB versus 4 in BGR, and blog-01 gave 0.926 versus 0.850. That margin is the
// check; if BGR ever matches or beats RGB, rgbaToTensor has been broken.
//
// Requires the three config env vars to be set (nothing contacts them):
//   SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x TANK_ARCHIVE_INGEST_SECRET=x \
//     TANK_VISION_MODEL_PATH=../../public/models/yolov8n.onnx \
//     bun src/selftest.ts ../../public/hero-image-01.jpg
process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "k";
process.env.TANK_ARCHIVE_INGEST_SECRET ||= "s";

import { spawn } from "node:child_process";
import { computeLetterbox, MODEL_SIZE, parseYoloOutput, rgbaToTensor } from "../../../src/zones/tank/vision/decode";
import { probeStream } from "./frameSource";
import { config } from "./config";

function grabFrame(path: string, nw: number, nh: number, padX: number, padY: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      config.ffmpegPath,
      [
        "-hide_banner", "-loglevel", "error",
        "-i", path,
        "-frames:v", "1",
        "-vf", `scale=${nw}:${nh}:flags=bilinear,pad=${MODEL_SIZE}:${MODEL_SIZE}:${padX}:${padY}:black`,
        "-pix_fmt", "rgba",
        "-f", "rawvideo", "-",
      ],
      { stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c) => { stderr += String(c); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg ${code}: ${stderr}`));
      resolve(Buffer.concat(chunks));
    });
  });
}

/** Swaps the R and B bytes of an RGBA buffer, to model getting the order wrong. */
function swapRB(rgba: Uint8Array): Uint8Array {
  const out = Uint8Array.from(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    out[i] = out[i + 2];
    out[i + 2] = r;
  }
  return out;
}

const ort: any = await import("onnxruntime-web");
ort.env.wasm.numThreads = 1;
ort.env.logLevel = "error";
const modelBytes = await Bun.file(config.modelPath).arrayBuffer();
const session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });

async function run(rgba: Uint8Array, lb: ReturnType<typeof computeLetterbox>, w: number, h: number) {
  const tensor = new ort.Tensor("float32", rgbaToTensor(rgba), [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const output = await session.run({ images: tensor });
  return parseYoloOutput(output.output0.data as Float32Array, lb, w, h);
}

const images = process.argv.slice(2);
for (const image of images) {
  try {
    const { width, height } = await probeStream(image);
    const lb = computeLetterbox(width, height);
    const nw = Math.round(width * lb.scale);
    const nh = Math.round(height * lb.scale);
    const frame = await grabFrame(image, nw, nh, lb.padX, lb.padY);

    const correct = await run(frame, lb, width, height);
    const swapped = await run(swapRB(frame), lb, width, height);

    const fmt = (list: Awaited<ReturnType<typeof run>>) =>
      list.length === 0
        ? "none"
        : list.map((d) => `${d.label} ${d.confidence.toFixed(3)}`).join(", ");

    console.log(`\n${image}  (${width}x${height}, scale ${lb.scale.toFixed(4)}, pad ${lb.padX}/${lb.padY})`);
    console.log(`  RGB  : ${fmt(correct)}`);
    console.log(`  BGR  : ${fmt(swapped)}`);
  } catch (error) {
    console.log(`\n${image}  FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exit(0);
