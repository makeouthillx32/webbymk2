// src/zones/tank/public/useInvisibleTouchTelemetry.ts
// ─────────────────────────────────────────────────────────────────────────────
// [LEGACY / STAGED FEATURE] Invisible Viewport Touch Telemetry
//
// Completely silent gesture detection hook preserved for upcoming backend
// TouchDesigner / computer vision camera integration. Inactive by default.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import { useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";

export type TouchEventPayload = {
  nx: number; // Normalized X (0.000 to 1.000 relative to video player)
  ny: number; // Normalized Y (0.000 to 1.000 relative to video player)
  zoneIndex: number; // 0: Left third, 1: Center third, 2: Right third (e.g. 3-camera IRL Mukbang)
  gridId: string; // e.g. "quad_4x4_x2_y1" for fine heatmap clustering
  pointerType: "touch" | "mouse" | "pen";
  timestamp: number;
  camSlug?: string;
};

import { claimInteractiveTargetTap, type TapClaimResult } from "../server/interactiveTargetActions";

export type TouchTelemetryOptions = {
  enabled?: boolean;
  camSlug?: string;
  roomId?: string;
  gridCols?: number; // Default 3 (Left / Center / Right)
  heatmapBins?: number; // Default 10 (10x10 grid = 100 spatial bins)
  flushIntervalMs?: number; // Batch flushes every 1000ms to conserve socket headroom
  onLocalBatch?: (batch: TouchEventPayload[]) => void;
  onHitSuccess?: (result: TapClaimResult, coords: { nx: number; ny: number }) => void;
};

export function useInvisibleTouchTelemetry(
  containerRef: React.RefObject<HTMLElement | null>,
  options: TouchTelemetryOptions = {}
) {
  const {
    enabled = true,
    camSlug = "director",
    roomId = "director",
    gridCols = 3,
    heatmapBins = 10,
    flushIntervalMs = 1500,
    onLocalBatch,
    onHitSuccess,
  } = options;

  const bufferRef = useRef<TouchEventPayload[]>([]);
  const lastFlushRef = useRef<number>(Date.now());
  const lastHitTestTimeRef = useRef<number>(0);
  const supabaseRef = useRef(createClient());
  // One channel per mount, reused across every flush. This used to call
  // supabase.channel(...) fresh inside flushBuffer on every single flush
  // that had pending taps and never removed any of them — every CameraPlayer
  // tile runs this (up to 6+ at once in director grid mode), each one
  // permanently accumulating channel objects in the Supabase client's
  // internal registry for the life of the page. Confirmed 2026-08-25: every
  // other Realtime channel in this codebase already creates once + removes
  // on cleanup except this one.
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length === 0) return;
    const batch = [...bufferRef.current];
    bufferRef.current = [];

    // 1. Notify local developer callback if provided
    if (onLocalBatch) {
      onLocalBatch(batch);
    }

    // 2. Broadcast to backend realtime channel for live Director Engine processing
    try {
      if (!channelRef.current) {
        channelRef.current = supabaseRef.current.channel("telemetry:viewport_gestures");
      }
      const channel = channelRef.current;
      void channel.send({
        type: "broadcast",
        event: "viewport_taps",
        payload: {
          camSlug,
          count: batch.length,
          taps: batch,
          // Aggregated zone votes for instant IRL camera switching:
          zoneVotes: batch.reduce((acc, tap) => {
            acc[tap.zoneIndex] = (acc[tap.zoneIndex] || 0) + 1;
            return acc;
          }, {} as Record<number, number>),
        },
      });
    } catch {}
  }, [camSlug, onLocalBatch]);

  useEffect(() => {
    if (!enabled) return;
    const element = containerRef.current;
    if (!element) return;

    const handlePointerDown = async (e: PointerEvent) => {
      // Passive capture: does not call preventDefault or stopPropagation
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      // 1. Calculate Normalized Coordinates [0.000, 1.000]
      const rawX = (e.clientX - rect.left) / rect.width;
      const rawY = (e.clientY - rect.top) / rect.height;

      const nx = Math.max(0, Math.min(1, parseFloat(rawX.toFixed(4))));
      const ny = Math.max(0, Math.min(1, parseFloat(rawY.toFixed(4))));

      // 2. Calculate Tri-Zone Column (0: Left, 1: Center, 2: Right)
      const zoneIndex = Math.min(gridCols - 1, Math.floor(nx * gridCols));

      // 3. Calculate Fine Heatmap Bin (e.g. 10x10 grid)
      const heatX = Math.min(heatmapBins - 1, Math.floor(nx * heatmapBins));
      const heatY = Math.min(heatmapBins - 1, Math.floor(ny * heatmapBins));
      const gridId = `h_${heatX}_${heatY}`;

      const pointerType = (e.pointerType || "touch") as "touch" | "mouse" | "pen";

      const payload: TouchEventPayload = {
        nx,
        ny,
        zoneIndex,
        gridId,
        pointerType,
        timestamp: Date.now(),
        camSlug,
      };

      bufferRef.current.push(payload);

      // 4. Interactive Target / Where's Waldo Hit-Test (Debounced 350ms)
      const now = Date.now();
      if (now - lastHitTestTimeRef.current > 350) {
        lastHitTestTimeRef.current = now;
        try {
          const res = await claimInteractiveTargetTap({ camSlug, roomId, nx, ny });
          if (res.hit && onHitSuccess) {
            onHitSuccess(res, { nx, ny });
          }
        } catch {}
      }

      // Periodic or threshold-based buffer flush
      if (Date.now() - lastFlushRef.current >= flushIntervalMs || bufferRef.current.length >= 25) {
        lastFlushRef.current = Date.now();
        flushBuffer();
      }
    };

    // Use passive listener so WebKit/Safari performance is 100% unconstrained
    element.addEventListener("pointerdown", handlePointerDown, { passive: true });

    // Flush interval timer
    const interval = setInterval(() => {
      if (bufferRef.current.length > 0) {
        flushBuffer();
      }
    }, flushIntervalMs);

    return () => {
      element.removeEventListener("pointerdown", handlePointerDown);
      clearInterval(interval);
      if (bufferRef.current.length > 0) {
        flushBuffer();
      }
      if (channelRef.current) {
        void supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, camSlug, roomId, gridCols, heatmapBins, flushIntervalMs, flushBuffer, onHitSuccess, containerRef]);

  return {
    getPendingBatchCount: () => bufferRef.current.length,
    forceFlush: flushBuffer,
  };
}
