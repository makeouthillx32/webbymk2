"use client";

import { useEffect, useState } from "react";
import { resolveGoalProgress, type GoalProgress, type StreamGoal } from "./goalProgress";

type GoalPayload = {
  active: (StreamGoal & { isActive: boolean; sortOrder: number }) | null;
  liveValue: number | null;
};

/**
 * The goal that is currently on air, kept fresh.
 *
 * POLLED, not realtime, and that is the deliberate choice. The other overlays
 * subscribe to a broadcast channel because their settings change rarely and
 * must apply instantly. A goal bar is the opposite: its number changes on its
 * own as viewers arrive, so it needs a heartbeat regardless, and a poll keeps
 * working on the days realtime does not — which this stack has had.
 *
 * Returns null until the first response, and HOLDS the last good value if a
 * poll fails. An overlay composited over a live broadcast must never flash
 * empty because one request timed out.
 */
export function useStreamGoal(refreshMs = 8_000): GoalProgress | null {
  const [progress, setProgress] = useState<GoalProgress | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/tank/goals", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { success?: boolean } & GoalPayload;
        if (cancelled) return;

        // No active goal is a real answer, not a failure: the bar disappears.
        if (!payload?.active) {
          setProgress(null);
          return;
        }
        setProgress(resolveGoalProgress(payload.active, payload.liveValue ?? null));
      } catch {
        // Held, not cleared. See above.
      }
    };

    void load();
    const timer = setInterval(() => void load(), refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [refreshMs]);

  return progress;
}
