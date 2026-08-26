"use client";

import { useEffect, useState } from "react";

export type NetworkSignalQuality = "excellent" | "good" | "fair" | "poor";

export type NetworkQualityState = {
  bars: 1 | 2 | 3 | 4;
  quality: NetworkSignalQuality;
  effectiveType: string;
  downlinkMbps: number | null;
  rttMs: number | null;
  isLowSignal: boolean;
  saveData: boolean;
};

export function useNetworkQuality(videoElement?: HTMLVideoElement | null): NetworkQualityState {
  const [state, setState] = useState<NetworkQualityState>(() => ({
    bars: 4,
    quality: "excellent",
    effectiveType: "4g",
    downlinkMbps: null,
    rttMs: null,
    isLowSignal: false,
    saveData: false,
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const nav = navigator as any;
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

    function evaluateConnection() {
      let downlink = conn?.downlink ?? null;
      let rtt = conn?.rtt ?? null;
      let effectiveType = conn?.effectiveType ?? "4g";
      let saveData = Boolean(conn?.saveData);

      let bars: 1 | 2 | 3 | 4 = 4;
      let quality: NetworkSignalQuality = "excellent";

      // Evaluate network speed & RTT
      if (downlink !== null) {
        if (downlink < 1.2 || rtt > 500 || effectiveType === "2g" || effectiveType === "slow-2g") {
          bars = 1;
          quality = "poor";
        } else if (downlink < 3.0 || rtt > 250 || effectiveType === "3g") {
          bars = 2;
          quality = "fair";
        } else if (downlink < 7.0 || rtt > 120) {
          bars = 3;
          quality = "good";
        } else {
          bars = 4;
          quality = "excellent";
        }
      } else if (effectiveType === "3g") {
        bars = 2;
        quality = "fair";
      } else if (effectiveType === "2g" || effectiveType === "slow-2g") {
        bars = 1;
        quality = "poor";
      }

      // Check dropped frames from video element if available
      if (videoElement && typeof videoElement.getVideoPlaybackQuality === "function") {
        try {
          const playbackQuality = videoElement.getVideoPlaybackQuality();
          const totalFrames = playbackQuality.totalVideoFrames;
          const droppedFrames = playbackQuality.droppedVideoFrames;
          if (totalFrames > 100) {
            const dropRatio = droppedFrames / totalFrames;
            if (dropRatio > 0.15) {
              bars = 1;
              quality = "poor";
            } else if (dropRatio > 0.05 && bars > 2) {
              bars = 2;
              quality = "fair";
            }
          }
        } catch {
          // ignore
        }
      }

      setState({
        bars,
        quality,
        effectiveType,
        downlinkMbps: downlink,
        rttMs: rtt,
        isLowSignal: bars <= 2 || quality === "poor",
        saveData,
      });
    }

    evaluateConnection();

    if (conn) {
      conn.addEventListener("change", evaluateConnection);
    }

    const interval = window.setInterval(evaluateConnection, 3500);

    return () => {
      if (conn) conn.removeEventListener("change", evaluateConnection);
      window.clearInterval(interval);
    };
  }, [videoElement]);

  return state;
}

export default useNetworkQuality;
