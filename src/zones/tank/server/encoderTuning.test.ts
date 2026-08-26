import { afterEach, describe, expect, test } from "bun:test";
import {
  archiveCodec,
  buildObsWhepSiblingCommand,
  buildPreviewSiblingCommand,
  encoderTuning,
  hwDecodeFlags,
  hwEncoderEnabled,
  provisionMediaMtxCamera,
  scaleFilter,
} from "./mediaGateway";

// The encoder choice decides whether the media host idles or saturates, so the
// behaviour is pinned rather than left to inspection. Measured on this host:
// libx264 veryfast = 30.4 CPU seconds per 60s of 720p30; h264_nvenc = 3.2s.

const saved = {
  hw: process.env.TANK_HW_ENCODER,
  codec: process.env.TANK_ARCHIVE_CODEC,
  api: process.env.MEDIAMTX_API_URL,
  low: process.env.TANK_HLS_LOW_RUNG,
  whep: process.env.TANK_WHEP_PUBLIC_BASE_URL,
  hls: process.env.TANK_HLS_PUBLIC_BASE_URL,
};

const nativeFetch = globalThis.fetch;

afterEach(() => {
  process.env.TANK_HW_ENCODER = saved.hw;
  process.env.TANK_ARCHIVE_CODEC = saved.codec;
  process.env.MEDIAMTX_API_URL = saved.api;
  process.env.TANK_HLS_LOW_RUNG = saved.low;
  process.env.TANK_WHEP_PUBLIC_BASE_URL = saved.whep;
  process.env.TANK_HLS_PUBLIC_BASE_URL = saved.hls;
  globalThis.fetch = nativeFetch;
});

describe("hardware encoder gating", () => {
  test("stays on software unless explicitly switched on", () => {
    delete process.env.TANK_HW_ENCODER;
    expect(hwEncoderEnabled()).toBe(false);
    expect(encoderTuning().live("1500k")).toContain("libx264");
  });

  test("a wrong value does not silently enable the GPU", () => {
    // A typo must fail closed to software, not half-enable a path that needs a
    // specific image to exist.
    process.env.TANK_HW_ENCODER = "yes";
    expect(hwEncoderEnabled()).toBe(false);
  });

  test("uses NVENC for live rungs when enabled", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    const live = encoderTuning().live("1500k");
    expect(live).toContain("h264_nvenc");
    expect(live).not.toContain("libx264");
    // x264-only flags must not leak into an nvenc command line — ffmpeg
    // rejects the whole invocation, so the rung would never start.
    expect(live).not.toContain("x264-params");
    expect(live).not.toContain("veryfast");
  });

  test("a software decode exception still keeps NVENC encoding enabled", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    expect(hwDecodeFlags(true)).toBe("");
    expect(scaleFilter(720, true)).toBe("scale=-2:720");
    expect(encoderTuning().live("4000k")).toContain("h264_nvenc");
  });

  test("carries the requested bitrate through both paths", () => {
    for (const hw of [undefined, "nvenc"]) {
      if (hw) process.env.TANK_HW_ENCODER = hw;
      else delete process.env.TANK_HW_ENCODER;
      expect(encoderTuning().live("2500k")).toContain("2500k");
      expect(encoderTuning().archive("900k")).toContain("900k");
    }
  });
});

describe("OBS WHEP delivery sibling", () => {
  test("normalizes hardware-backed OBS video to a fixed live GOP", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    const command = buildObsWhepSiblingCommand("obs/admin", "obs/admin-whep");

    expect(command).toContain("-hwaccel cuda");
    expect(command).toContain("scale_cuda=-2:1080");
    expect(command).toContain("-c:v h264_nvenc");
    expect(command).toContain("-g 60");
    expect(command).toContain("-c:a libopus");
    expect(command).toContain("rtsp://127.0.0.1:8554/obs/admin-whep");
  });

  test("does not surprise a CPU-only host with a 4K software encode", () => {
    delete process.env.TANK_HW_ENCODER;
    const command = buildObsWhepSiblingCommand("obs/admin", "obs/admin-whep");

    expect(command).toContain("-c:v copy");
    expect(command).not.toContain("libx264");
    expect(command).not.toContain("scale=");
  });
});

describe("OBS and IRL roster preview rung", () => {
  test("downscales contributions to a muted 360p 12fps bounded stream", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    const command = buildPreviewSiblingCommand("obs/admin-whep", "previews/obs-admin");

    expect(command).toContain("rtsp://127.0.0.1:8554/obs/admin-whep");
    expect(command).toContain("scale_cuda=-2:360");
    expect(command).toContain("-r 12");
    expect(command).toContain("-b:v 450k");
    expect(command).toContain("-g 24");
    expect(command).toContain("-an");
    expect(command).toContain("rtsp://127.0.0.1:8554/previews/obs-admin");
  });
});

describe("archive codec", () => {
  test("defaults to H.264 so older iPhones can still play archives", () => {
    // Safari decodes AV1 only on hardware that supports it (A17 Pro / M3 and
    // later). Defaulting to AV1 would make archives unplayable on most phones.
    delete process.env.TANK_ARCHIVE_CODEC;
    expect(archiveCodec()).toBe("h264");
    process.env.TANK_HW_ENCODER = "nvenc";
    expect(encoderTuning().archive("3000k")).toContain("h264_nvenc");
  });

  test("uses AV1 when explicitly opted in", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    process.env.TANK_ARCHIVE_CODEC = "av1";
    expect(archiveCodec()).toBe("av1");
    expect(encoderTuning().archive("900k")).toContain("av1_nvenc");
  });

  test("AV1 is ignored without the hardware encoder", () => {
    // Software AV1 (libaom/SVT) is far SLOWER than x264, so honouring this
    // without a GPU would be a severe performance regression.
    delete process.env.TANK_HW_ENCODER;
    process.env.TANK_ARCHIVE_CODEC = "av1";
    expect(encoderTuning().archive("900k")).toContain("libx264");
  });
});

describe("GPU decode and scaling move together", () => {
  // Measured on a live 4K camera, 20s, full rung set (copy + copy + 720p):
  //   software  11.0s user + 1.5s sys
  //   gpu        5.3s user + 0.7s sys
  // Offloading only the encode gave barely 17% — decoding 4K in software is
  // the real cost, so these two settings are one decision, not two.
  test("software mode uses a CPU scaler and no hwaccel", () => {
    delete process.env.TANK_HW_ENCODER;
    expect(hwDecodeFlags()).toBe("");
    expect(scaleFilter(720)).toBe("scale=-2:720");
  });

  test("GPU mode uses CUDA decode and a CUDA scaler", () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    expect(hwDecodeFlags()).toContain("-hwaccel cuda");
    expect(hwDecodeFlags()).toContain("-hwaccel_output_format cuda");
    expect(scaleFilter(720)).toBe("scale_cuda=-2:720");
  });

  test("a CUDA scaler is never paired with software decode", () => {
    // ffmpeg fails outright rather than falling back: a CPU filter cannot read
    // a CUDA frame, and a CUDA filter cannot read a system-memory frame. If
    // these ever disagree every transcoding rung stops starting.
    for (const hw of [undefined, "nvenc"]) {
      if (hw) process.env.TANK_HW_ENCODER = hw;
      else delete process.env.TANK_HW_ENCODER;
      const cudaScaler = scaleFilter(1080).includes("scale_cuda");
      const cudaDecode = hwDecodeFlags().includes("hwaccel cuda");
      expect(cudaScaler).toBe(cudaDecode);
    }
  });
});

describe("IRL normalization topology", () => {
  test("software-decodes once, encodes on NVENC, and remuxes HLS video", async () => {
    process.env.TANK_HW_ENCODER = "nvenc";
    process.env.TANK_HLS_LOW_RUNG = "1";
    process.env.MEDIAMTX_API_URL = "http://mediamtx.test:9997";
    process.env.TANK_WHEP_PUBLIC_BASE_URL = "https://media.test/webrtc";
    process.env.TANK_HLS_PUBLIC_BASE_URL = "https://media.test/hls";

    const configured = new Map<string, Record<string, unknown>>();
    globalThis.fetch = (async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const match = url.pathname.match(/\/v3\/config\/paths\/(?:get|patch|add)\/(.+)$/);
      const path = match ? decodeURIComponent(match[1]) : "";

      if (url.pathname.startsWith("/v3/paths/get/")) {
        return Response.json({ ready: true, tracks: ["H265", "AAC"] });
      }
      if (url.pathname.includes("/config/paths/get/")) {
        return configured.has(path)
          ? Response.json(configured.get(path))
          : new Response("missing", { status: 404 });
      }
      if (url.pathname.includes("/config/paths/patch/")) {
        return new Response("missing", { status: 404 });
      }
      if (url.pathname.includes("/config/paths/add/")) {
        configured.set(path, JSON.parse(String(init?.body ?? "{}")));
        return new Response(null, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const result = await provisionMediaMtxCamera(
      "cam-irl-test",
      "srt://receiver.test:9000?mode=caller",
      {
        transcodeAudio: true,
        forceVideoTranscode: true,
        forceSoftwareDecode: true,
        previewRung: true,
      },
    );

    expect(result.ok).toBe(true);
    const main = String(configured.get("cameras/cam-irl-test")?.runOnInit ?? "");
    const hls = String(configured.get("cameras/cam-irl-test-hls")?.runOnInit ?? "");
    const preview = String(configured.get("cameras/cam-irl-test-preview")?.runOnInit ?? "");

    expect(main).not.toContain("-hwaccel cuda");
    expect(main).toContain("-vf scale=-2:720");
    expect(main.match(/-c:v h264_nvenc/g)?.length).toBe(2);
    expect(hls).toContain("-c:v copy");
    expect(hls).toContain("-c:a aac");
    expect(hls).not.toContain("h264_nvenc");
    expect(hls).not.toContain("libx264");
    expect(preview).toContain("scale_cuda=-2:360");
    expect(preview).toContain("-r 12");
    expect(preview).toContain("-b:v 450k");
    expect(preview).toContain("-an");
  });
});
