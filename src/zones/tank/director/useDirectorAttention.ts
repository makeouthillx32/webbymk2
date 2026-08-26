"use client";

import { useState, useEffect, useCallback } from "react";
import type { DirectorAttentionLock } from "./directorMetrics";
import { DEFAULT_DIRECTOR_ATTENTION } from "./directorMetrics";

export function useDirectorAttention() {
  const [attentionLock, setAttentionLock] = useState<DirectorAttentionLock>(DEFAULT_DIRECTOR_ATTENTION);
  const [loading, setLoading] = useState(false);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);

  const fetchAttention = useCallback(async () => {
    try {
      const res = await fetch("/api/tank/director/attention");
      if (res.ok) {
        const data = await res.json();
        if (data.lock) {
          setAttentionLock(data.lock);
        }
      }
    } catch {}
  }, []);

  // Poll state every 4 seconds
  useEffect(() => {
    fetchAttention();
    const interval = setInterval(fetchAttention, 4000);
    return () => clearInterval(interval);
  }, [fetchAttention]);

  // Update countdown timer every second
  useEffect(() => {
    if (!attentionLock.active || !attentionLock.expiresAt) {
      setTimeRemainingSeconds(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((attentionLock.expiresAt! - now) / 1000));
      setTimeRemainingSeconds(remaining);

      if (remaining <= 0) {
        setAttentionLock((prev) => ({ ...prev, active: false }));
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [attentionLock.active, attentionLock.expiresAt]);

  const setAttention = async (params: {
    targetType: "room" | "camera" | "irl";
    targetId: string;
    targetLabel: string;
    durationMinutes: number | "indefinite";
    multiCameraMode?: "audio_peak" | "round_robin" | "fixed_primary";
  }) => {
    setLoading(true);
    try {
      const res = await fetch("/api/tank/director/attention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.lock) {
          setAttentionLock(data.lock);
        }
        return { success: true };
      }
      const err = await res.json();
      return { success: false, error: err.error };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Network error" };
    } finally {
      setLoading(false);
    }
  };

  const releaseAttention = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tank/director/attention", { method: "DELETE" });
      if (res.ok) {
        setAttentionLock(DEFAULT_DIRECTOR_ATTENTION);
        return { success: true };
      }
      const err = await res.json();
      return { success: false, error: err.error };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Network error" };
    } finally {
      setLoading(false);
    }
  };

  return {
    attentionLock,
    timeRemainingSeconds,
    loading,
    setAttention,
    releaseAttention,
    refresh: fetchAttention,
  };
}
