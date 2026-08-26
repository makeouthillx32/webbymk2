/**
 * Low-Data & Cellular Network Optimizer for Tank Live Platform
 * Provides adaptive network detection, Hls.js low-buffer profiles, and bandwidth scaling rules.
 */

export type NetworkProfile = {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
};

export type StreamRung = "auto" | "1080p-high" | "720p-low" | "audio-only";

export type LowDataTuningConfig = {
  selectedRung: StreamRung;
  maxBufferLength: number;
  maxMaxBufferLength: number;
  maxBufferSize: number;
  liveSyncDurationCount: number;
  lowLatencyMode: boolean;
  enableBackgroundThrottling: boolean;
  estimatedBandwidthSavingsPct: number;
};

/**
 * Evaluates client network conditions and returns the optimal stream quality rung.
 */
export function resolveOptimalStreamRung(network?: NetworkProfile): StreamRung {
  if (!network) return "auto";

  // User explicitly enabled browser Data Saver mode
  if (network.saveData) return "720p-low";

  // Constrained 2G / Slow-2G -> Audio-only or ultra low
  if (network.effectiveType === "slow-2g" || network.effectiveType === "2g") {
    return "audio-only";
  }

  // 3G or downlink under 2.5 Mbps -> 720p Low Rung
  if (
    network.effectiveType === "3g" ||
    (network.downlinkMbps !== undefined && network.downlinkMbps < 2.5) ||
    (network.rttMs !== undefined && network.rttMs > 400)
  ) {
    return "720p-low";
  }

  return "1080p-high";
}

/**
 * Returns optimized Hls.js player parameters tailored for low-data / mobile cellular connections.
 */
export function getLowDataHlsConfig(network?: NetworkProfile): LowDataTuningConfig {
  const rung = resolveOptimalStreamRung(network);

  if (rung === "720p-low" || rung === "audio-only") {
    return {
      selectedRung: rung,
      maxBufferLength: 4, // 4s buffer instead of 30s
      maxMaxBufferLength: 8,
      maxBufferSize: 5 * 1024 * 1024, // 5 MB max buffer in RAM
      liveSyncDurationCount: 2, // Stay at live edge without accumulating queue
      lowLatencyMode: true,
      enableBackgroundThrottling: true,
      estimatedBandwidthSavingsPct: 75, // 75% less data consumed
    };
  }

  // Standard High-Performance Profile
  return {
    selectedRung: "1080p-high",
    maxBufferLength: 15,
    maxMaxBufferLength: 30,
    maxBufferSize: 30 * 1024 * 1024,
    liveSyncDurationCount: 3,
    lowLatencyMode: true,
    enableBackgroundThrottling: true,
    estimatedBandwidthSavingsPct: 0,
  };
}

/**
 * Calculates bandwidth savings when inactive multi-camera feeds are throttled.
 */
export function calculateMultiCamSavings(
  totalCams: number,
  activeCamBitrateKbps = 9500,
  backgroundCamBitrateKbps = 50, // Snapshot poster poll rate
): { unthrottledMbps: number; throttledMbps: number; bandwidthReductionPct: number } {
  if (totalCams <= 1) {
    return {
      unthrottledMbps: Number((activeCamBitrateKbps / 1000).toFixed(2)),
      throttledMbps: Number((activeCamBitrateKbps / 1000).toFixed(2)),
      bandwidthReductionPct: 0,
    };
  }

  const unthrottledKbps = totalCams * activeCamBitrateKbps;
  const throttledKbps = activeCamBitrateKbps + (totalCams - 1) * backgroundCamBitrateKbps;

  const unthrottledMbps = Number((unthrottledKbps / 1000).toFixed(2));
  const throttledMbps = Number((throttledKbps / 1000).toFixed(2));
  const bandwidthReductionPct = Math.round(
    ((unthrottledKbps - throttledKbps) / unthrottledKbps) * 100,
  );

  return {
    unthrottledMbps,
    throttledMbps,
    bandwidthReductionPct,
  };
}
