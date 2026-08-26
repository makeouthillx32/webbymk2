"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WatchMode } from "../server/watchTimeAccrual";

export type WatchTimeAccrualState = {
  currentXp: number;
  currentTokens: number;
  currentLevel: number;
  ratePerSecond: number;
  isWatching: boolean;
  levelUpNotif: number | null;
  clearLevelUpNotif: () => void;
  applyReward: (xpAwarded: number, tokensAwarded: number) => void;
};

import { getLevelForXp } from "../xpLevels";

export function useTankWatchTimeAccrual(
  initialXp: number,
  initialTokens: number,
  initialLevel: number,
  signedIn: boolean,
  activeMode: WatchMode,
  activeRoomId?: string,
  telemetry?: { averageLatencyMs?: number; networkType?: string; stallCount?: number },
): WatchTimeAccrualState {
  const normalizedInitialLevel = getLevelForXp(initialXp);
  const [currentXp, setCurrentXp] = useState(initialXp);
  const [currentTokens, setCurrentTokens] = useState(initialTokens);
  const [currentLevel, setCurrentLevel] = useState(normalizedInitialLevel);
  const [levelUpNotif, setLevelUpNotif] = useState<number | null>(null);

  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerLevelUpNotif = useCallback((lvl: number) => {
    setLevelUpNotif(lvl);
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => {
      setLevelUpNotif(null);
    }, 6000); // Auto-dismiss after 6 seconds
  }, []);

  const ratePerSecond = activeMode === "room_direct" ? 0.08 : 0.04;

  const secondsAccumulator = useRef(0);
  const isTabVisible = useRef(true);

  // Sync tab visibility so users only get XP while actively watching
  useEffect(() => {
    const handleVisibilityChange = () => {
      isTabVisible.current = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // 1-second interval ticker for instantaneous smooth client XP feedback
  useEffect(() => {
    if (!signedIn) return;

    const ticker = setInterval(() => {
      if (!isTabVisible.current) return;

      secondsAccumulator.current += 1;
      setCurrentXp((prev) => Math.round((prev + ratePerSecond) * 100) / 100);

      // Local level preview
      setCurrentXp((prevXp) => {
        const estLevel = getLevelForXp(prevXp);
        setCurrentLevel((prevLvl) => {
          if (estLevel > prevLvl) {
            triggerLevelUpNotif(estLevel);
            return estLevel;
          }
          return prevLvl;
        });
        return prevXp;
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [signedIn, ratePerSecond, triggerLevelUpNotif]);

  // Periodic network sync heartbeat every 10 seconds to reconcile state with Supabase
  const sendHeartbeat = useCallback(async () => {
    const elapsed = secondsAccumulator.current;
    if (elapsed <= 0 || !signedIn) return;

    secondsAccumulator.current = 0; // reset local batch

    try {
      const res = await fetch("/api/tank/watch/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seconds: elapsed,
          watchMode: activeMode,
          roomId: activeRoomId,
          telemetry,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCurrentXp(data.currentXp);
          setCurrentTokens(data.currentTokens);
          setCurrentLevel(data.currentLevel);
          if (data.levelUp) {
            triggerLevelUpNotif(data.currentLevel);
          }
        }
      }
    } catch {
      // Re-add unsynced seconds on transient network failure
      secondsAccumulator.current += elapsed;
    }
  }, [signedIn, activeMode, activeRoomId, triggerLevelUpNotif]);

  useEffect(() => {
    if (!signedIn) return;

    const heartbeatInterval = setInterval(() => {
      void sendHeartbeat();
    }, 10000);

    // Sync when tab unloads or unmounts
    const handleBeforeUnload = () => {
      void sendHeartbeat();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void sendHeartbeat();
    };
  }, [signedIn, sendHeartbeat]);

  const clearLevelUpNotif = useCallback(() => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setLevelUpNotif(null);
  }, []);

  const applyReward = useCallback((xpAwarded: number, tokensAwarded: number) => {
    setCurrentXp((previous) => previous + Math.max(0, xpAwarded));
    setCurrentTokens((previous) => previous + Math.max(0, Math.trunc(tokensAwarded)));
  }, []);

  return {
    currentXp,
    currentTokens,
    currentLevel,
    ratePerSecond,
    isWatching: signedIn,
    levelUpNotif,
    clearLevelUpNotif,
    applyReward,
  };
}
export default useTankWatchTimeAccrual;
