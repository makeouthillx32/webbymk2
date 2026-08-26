"use client";

import { useState, useEffect, useRef } from "react";
import type { CameraAudioMetrics } from "./directorMetrics";
import { dbToEnergy, SPEECH_THRESHOLD_DB } from "./directorMetrics";
import type { DiscoveredCamera } from "../contracts";

export function useCameraAudioMetrics(cameras: DiscoveredCamera[]) {
  const [metricsMap, setMetricsMap] = useState<Map<string, CameraAudioMetrics>>(new Map());
  const stateRef = useRef<Map<string, { currentDb: number; targetDb: number; peakDb: number; phase: number }>>(
    new Map()
  );

  useEffect(() => {
    if (cameras.length === 0) return;

    // Initialize state ref for each camera
    cameras.forEach((cam, index) => {
      if (!stateRef.current.has(cam.id)) {
        // Base room noise profile
        const baseNoise = -45 + (index % 3) * 5;
        stateRef.current.set(cam.id, {
          currentDb: baseNoise,
          targetDb: baseNoise,
          peakDb: baseNoise,
          phase: Math.random() * 100,
        });
      }
    });

    const interval = setInterval(() => {
      const now = Date.now();
      const updated = new Map<string, CameraAudioMetrics>();

      cameras.forEach((cam) => {
        let state = stateRef.current.get(cam.id);
        if (!state) {
          state = { currentDb: -48, targetDb: -48, peakDb: -48, phase: Math.random() * 100 };
          stateRef.current.set(cam.id, state);
        }

        // Advance phase & calculate gentle room ambience (low frequency oscillation)
        state.phase += 0.05;
        const sineWave = Math.sin(state.phase) * 4;
        // Rare speech bursts (only 3% probability)
        const randomSpike = Math.random() > 0.97 ? (Math.random() * 12 + 6) : 0;

        // Base room noise + speech burst
        const baseDb = -48;
        state.targetDb = Math.min(-10, Math.max(-60, baseDb + sineWave + randomSpike));

        // Smooth gradual transitions (Attack 0.2, Decay 0.05)
        if (state.targetDb > state.currentDb) {
          state.currentDb += (state.targetDb - state.currentDb) * 0.2;
        } else {
          state.currentDb += (state.targetDb - state.currentDb) * 0.05;
        }

        // Peak Hold with gentle decay
        if (state.currentDb > state.peakDb) {
          state.peakDb = state.currentDb;
        } else {
          state.peakDb -= 0.15;
        }

        const energy = dbToEnergy(state.currentDb);
        const isSpeaking = state.currentDb > SPEECH_THRESHOLD_DB;

        updated.set(cam.id, {
          cameraId: cam.id,
          roomScope: cam.roomScope ?? "",
          name: cam.name,
          decibels: state.currentDb,
          audioEnergy: energy,
          isSpeaking,
          peakHoldDb: state.peakDb,
          activityScore: energy * 0.7 + (isSpeaking ? 0.3 : 0),
        });
      });

      setMetricsMap(updated);
    }, 1000); // 1.0s update cadence for calm, steady audio tracking

    return () => clearInterval(interval);
  }, [cameras]);

  return { metricsMap };
}
