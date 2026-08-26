import { describe, expect, it } from "bun:test";
import {
  calculateMultiCamSavings,
  getLowDataHlsConfig,
  resolveOptimalStreamRung,
} from "./lowDataOptimizer";

describe("Tank Low-Data & Cellular Network Optimizer", () => {
  it("resolves high quality rung on fast 4G / broadband networks", () => {
    const rung = resolveOptimalStreamRung({
      effectiveType: "4g",
      downlinkMbps: 25.0,
      rttMs: 45,
      saveData: false,
    });
    expect(rung).toBe("1080p-high");
  });

  it("automatically falls back to 720p-low on 3G cellular connections", () => {
    const rung = resolveOptimalStreamRung({
      effectiveType: "3g",
      downlinkMbps: 1.8,
      rttMs: 350,
      saveData: false,
    });
    expect(rung).toBe("720p-low");
  });

  it("prioritizes 720p-low when user has browser Data Saver enabled", () => {
    const rung = resolveOptimalStreamRung({
      effectiveType: "4g",
      downlinkMbps: 50.0,
      rttMs: 20,
      saveData: true,
    });
    expect(rung).toBe("720p-low");
  });

  it("falls back to audio-only on extremely constrained 2G networks", () => {
    const rung = resolveOptimalStreamRung({
      effectiveType: "2g",
      downlinkMbps: 0.25,
      rttMs: 800,
      saveData: false,
    });
    expect(rung).toBe("audio-only");
  });

  it("generates clamped HLS buffer parameters in low-data mode", () => {
    const config = getLowDataHlsConfig({
      effectiveType: "3g",
      downlinkMbps: 1.5,
    });

    expect(config.selectedRung).toBe("720p-low");
    expect(config.maxBufferLength).toBe(4); // 4 seconds instead of 15-30s
    expect(config.maxBufferSize).toBe(5 * 1024 * 1024); // 5 MB RAM buffer cap
    expect(config.liveSyncDurationCount).toBe(2);
    expect(config.estimatedBandwidthSavingsPct).toBe(75);
  });

  it("calculates multi-cam bandwidth savings when background feeds are throttled", () => {
    // 4 house cameras at 9.5 Mbps each = 38 Mbps unthrottled
    // Throttled: 1 active center camera (9.5 Mbps) + 3 background poster snapshots (50 Kbps) = ~9.65 Mbps
    const savings = calculateMultiCamSavings(4, 9500, 50);

    expect(savings.unthrottledMbps).toBe(38.0);
    expect(savings.throttledMbps).toBe(9.65);
    expect(savings.bandwidthReductionPct).toBe(75); // 75% bandwidth reduction!
  });
});
