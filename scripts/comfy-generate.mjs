#!/usr/bin/env node

/**
 * comfy-generate.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency CLI helper for ComfyUI REST API.
 * Submits an SDXL Turbo workflow, polls execution, and downloads the output image.
 *
 * Usage:
 *   node comfy-generate.mjs --prompt "futuristic neon control room" --out cover.png
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    prompt: "",
    negative: "blurry, low quality, distorted, artifacts, signature, watermark, deformed, bad anatomy, text",
    out: "output.png",
    width: 1024,
    height: 576, // 16:9 widescreen default for blog covers
    steps: 4,
    cfg: 1.0,
    host: process.env.COMFYUI_HOST || "127.0.0.1:8188",
    ckpt: "sd_xl_turbo_1.0_fp16.safetensors",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--prompt":
      case "-p":
        options.prompt = args[++i] || "";
        break;
      case "--negative":
      case "-n":
        options.negative = args[++i] || options.negative;
        break;
      case "--out":
      case "-o":
        options.out = args[++i] || options.out;
        break;
      case "--width":
        options.width = parseInt(args[++i], 10) || 1024;
        break;
      case "--height":
        options.height = parseInt(args[++i], 10) || 576;
        break;
      case "--steps":
        options.steps = parseInt(args[++i], 10) || 4;
        break;
      case "--cfg":
        options.cfg = parseFloat(args[++i]) || 1.0;
        break;
      case "--host":
        options.host = args[++i] || options.host;
        break;
      case "--ckpt":
        options.ckpt = args[++i] || options.ckpt;
        break;
    }
  }

  return options;
}

function buildSdxlTurboWorkflow(options) {
  const seed = Math.floor(Math.random() * 10000000000);
  return {
    "3": {
      inputs: {
        seed,
        steps: options.steps,
        cfg: options.cfg,
        sampler_name: "euler_ancestral",
        scheduler: "karras",
        denoise: 1.0,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
      class_type: "KSampler",
    },
    "4": {
      inputs: {
        ckpt_name: options.ckpt,
      },
      class_type: "CheckpointLoaderSimple",
    },
    "5": {
      inputs: {
        width: options.width,
        height: options.height,
        batch_size: 1,
      },
      class_type: "EmptyLatentImage",
    },
    "6": {
      inputs: {
        text: options.prompt,
        clip: ["4", 1],
      },
      class_type: "CLIPTextEncode",
    },
    "7": {
      inputs: {
        text: options.negative,
        clip: ["4", 1],
      },
      class_type: "CLIPTextEncode",
    },
    "8": {
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
      class_type: "VAEDecode",
    },
    "9": {
      inputs: {
        filename_prefix: "blog_cover",
        images: ["8", 0],
      },
      class_type: "SaveImage",
    },
  };
}

async function main() {
  const opts = parseArgs();
  if (!opts.prompt.trim()) {
    console.error(JSON.stringify({ ok: false, error: "Missing required argument: --prompt" }));
    process.exit(1);
  }

  // Probe candidate hosts to find a reachable ComfyUI instance. From WSL, set
  // COMFYUI_HOST to the Windows host's LAN address (host:port).
  const candidateHosts = opts.explicitHost
    ? [opts.host]
    : [process.env.COMFYUI_HOST, opts.host, "127.0.0.1:8188", "localhost:8188"].filter(Boolean);

  let activeBaseUrl = null;
  for (const host of candidateHosts) {
    const candidate = host.startsWith("http") ? host : `http://${host}`;
    try {
      const ping = await fetch(`${candidate}/system_stats`, { signal: AbortSignal.timeout(1500) });
      if (ping.ok) {
        activeBaseUrl = candidate;
        break;
      }
    } catch {
      // Continue searching
    }
  }

  const baseUrl = activeBaseUrl || (opts.host.startsWith("http") ? opts.host : `http://${opts.host}`);
  const t0 = Date.now();

  try {
    const workflow = buildSdxlTurboWorkflow(opts);
    const postRes = await fetch(`${baseUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
    });

    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`ComfyUI /prompt error (${postRes.status}): ${err}`);
    }

    const { prompt_id } = await postRes.json();
    if (!prompt_id) throw new Error("No prompt_id returned from ComfyUI");

    // Poll /history/<prompt_id> until output appears (max 120s timeout)
    const maxPollMs = 120000;
    const pollInterval = 400;
    let elapsed = 0;
    let outputImage = null;

    while (elapsed < maxPollMs) {
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;

      const histRes = await fetch(`${baseUrl}/history/${prompt_id}`);
      if (!histRes.ok) continue;

      const history = await histRes.json();
      const promptData = history[prompt_id];
      if (promptData && promptData.outputs && promptData.outputs["9"]) {
        const images = promptData.outputs["9"].images;
        if (images && images.length > 0) {
          outputImage = images[0];
          break;
        }
      }
    }

    if (!outputImage) {
      throw new Error(`Timed out waiting for image generation after ${maxPollMs / 1000}s`);
    }

    // Fetch generated image binary
    const viewUrl = `${baseUrl}/view?filename=${encodeURIComponent(outputImage.filename)}&subfolder=${encodeURIComponent(outputImage.subfolder || "")}&type=${encodeURIComponent(outputImage.type || "output")}`;
    const imgRes = await fetch(viewUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch rendered image from ${viewUrl}`);

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const outPath = resolve(opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buffer);

    // Save base64 companion file for easy ingest payload integration
    const b64 = buffer.toString("base64");
    writeFileSync(`${outPath}.b64`, b64);

    const totalMs = Date.now() - t0;
    console.log(JSON.stringify({
      ok: true,
      path: outPath,
      b64Path: `${outPath}.b64`,
      bytes: buffer.length,
      elapsedMs: totalMs,
      prompt: opts.prompt,
    }));
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - t0,
    }));
    process.exit(1);
  }
}

main();
