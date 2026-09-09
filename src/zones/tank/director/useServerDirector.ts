"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ServerDirectorState, ServerDirectorMode } from "../server/serverDirectorEngine";
import type { DirectorAttentionLock } from "./directorMetrics";
import type { VirtualPtzState } from "../director-configuration/components/NavigationController";
import type { DirectorProgramSnapshot } from "../server/directorProgram";

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
  const [ptzState, setPtzState] = useState<VirtualPtzState | null>(initialState?.ptzState ?? null);
  const [program, setProgram] = useState<DirectorProgramSnapshot | null>(null);

  const dwellReceivedAtRef = useRef<number>(Date.now());
  const dwellBaseRef = useRef<number>(initialState?.dwellSecondsRemaining ?? 15);

  // 1. Subscribe to Central Server Realtime Broadcast
  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    const channel = supabase.channel("tank:director:state");

    const applyState = (state: ServerDirectorState) => {
      setActiveCameraId(state.activeCameraId);
      setActiveRoomKey(state.activeRoomKey);
      setMode(state.mode);
      setReason(state.reason);
      setAttentionLock(state.attentionLock);
      setPtzState(state.mode === "MANUAL_PILOT" ? state.ptzState ?? null : null);
      dwellReceivedAtRef.current = Date.now();
      dwellBaseRef.current = state.dwellSecondsRemaining ?? 15;
      setDwellSecondsRemaining(dwellBaseRef.current);
    };

    const refreshState = async () => {
      try {
        const response = await fetch("/api/tank/director/state", { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.state) applyState(payload.state as ServerDirectorState);
        if (payload?.program) setProgram(payload.program as DirectorProgramSnapshot);
      } catch {
        // Realtime remains the fast path; the next poll retries the durable state.
      }
    };

    channel
      .on("broadcast", { event: "director_cut" }, (payload) => {
        const state = payload.payload as ServerDirectorState;
        if (state) applyState(state);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshState();
      });

    const poll = setInterval(refreshState, 5000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [enabled]);

  // 2. Client Dwell Countdown (Synced with Server Timestamp)
  useEffect(() => {
    if (!enabled) return;

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - dwellReceivedAtRef.current) / 1000);
      const remaining = Math.max(0, dwellBaseRef.current - elapsed);
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
    ptzState,
    program,
  };
}
