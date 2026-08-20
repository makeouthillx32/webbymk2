import { afterEach, describe, expect, test } from "bun:test";
import {
  archiveCodec,
  encoderTuning,
  hwDecodeFlags,
  hwEncoderEnabled,
  scaleFilter,
} from "./mediaGateway";

// The encoder choice decides whether the media host idles or saturates, so the
// behaviour is pinned rather than left to inspection. Measured on this host:
// libx264 veryfast = 30.4 CPU seconds per 60s of 720p30; h264_nvenc = 3.2s.

const saved = {
  hw: process.env.TANK_HW_ENCODER,
  codec: process.env.TANK_ARCHIVE_CODEC,
};

afterEach(() => {
  process.env.TANK_HW_ENCODER = saved.hw;
  process.env.TANK_ARCHIVE_CODEC = saved.codec;
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

  test("carries the requested bitrate through both paths", () => {
    for (const hw of [undefined, "nvenc"]) {
      if (hw) process.env.TANK_HW_ENCODER = hw;
      else delete process.env.TANK_HW_ENCODER;
      expect(encoderTuning().live("2500k")).toContain("2500k");
      expect(encoderTuning().archive("900k")).toContain("900k");
    }
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
