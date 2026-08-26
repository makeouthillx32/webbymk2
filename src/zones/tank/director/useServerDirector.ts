"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ServerDirectorState, ServerDirectorMode } from "../server/serverDirectorEngine";
import type { DirectorAttentionLock } from "./directorMetrics";

export type UseServerDirectorOptions = {
  initialState?: Partial<ServerDirectorState> | null;
  enabled?: boolean;
};

export function useServerDirector(options: UseServerDirectorOptions = {}) {
  const { initialState, enabled = true } = options;

  const [activeCameraId, setActiveCameraId] = useState<string>(
    initialState?.activeCameraId || "cam-1786768240090"
  );
  const [activeRoomKey, setActiveRoomKey] = useState<string>(
    initialState?.activeRoomKey || "game-room"
  );
  const [mode, setMode] = useState<ServerDirectorMode>(
    initialState?.mode || "STANDBY"
  );
  const [dwellSecondsRemaining, setDwellSecondsRemaining] = useState<number>(
    initialState?.dwellSecondsRemaining || 15
  );
  const [reason, setReason] = useState<string>(
    initialState?.reason || "[STANDBY] Attached to Central Server Feed"
  );
  const [attentionLock, setAttentionLock] = useState<DirectorAttentionLock | null>(
    initialState?.attentionLock || null
  );

  const switchedAtRef = useRef<number>(initialState?.switchedAt || Date.now());

  // 1. Subscribe to Central Server Realtime Broadcast
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase.channel("tank:director:state");

    channel
      .on("broadcast", { event: "director_cut" }, (payload) => {
        const state = payload.payload as ServerDirectorState;
        if (state) {
          setActiveCameraId(state.activeCameraId);
          setActiveRoomKey(state.activeRoomKey);
          setMode(state.mode);
          setReason(state.reason);
          setAttentionLock(state.attentionLock);
          switchedAtRef.current = state.switchedAt || Date.now();
          setDwellSecondsRemaining(state.dwellSecondsRemaining || 15);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  // 2. Client Dwell Countdown (Synced with Server Timestamp)
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - switchedAtRef.current) / 1000);
      const remaining = Math.max(0, 15 - elapsed);
      setDwellSecondsRemaining(remaining);
    }, 1000);

    return () => clearInterval(timer);
  }, [enabled]);

  return {
    activeCameraId,
    activeRoomKey,
    mode,
    dwellSecondsRemaining,
    reason,
    attentionLock,
  };
}
