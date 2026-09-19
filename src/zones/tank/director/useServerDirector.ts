"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import type { ServerDirectorState, ServerDirectorMode } from "../server/serverDirectorEngine";
import type { ActiveChaosItemPayload } from "./chaosDirectorCatalog";
import type { DirectorAttentionLock } from "./directorMetrics";
import type { VirtualPtzState } from "./ptzState";
import type { DirectorProgramSnapshot } from "../server/directorProgram";

export type UseServerDirectorOptions = {
  initialState?: Partial<ServerDirectorState> | null;
  enabled?: boolean;
};

export function useServerDirector(options: UseServerDirectorOptions = {}) {
  const { initialState, enabled = true } = options;

  // EMPTY, not a guessed camera.
  //
  // These used to default to "cam-1786768240090" / "game-room". Every
  // consumer reads them the moment it mounts, so an OBS overlay confidently
  // captioned the shot GAME ROOM while the director was actually on the
  // Kitchen, correcting only seconds later when real state arrived. Measured
  // 2026-09-13: three samples, director on kitchen throughout, HUD showing
  // GAME ROOM and then KITCHEN.
  //
  // Empty is falsy, which every consumer already treats as "nothing selected
  // yet" and renders as a neutral fallback. A wrong room is worse than no
  // room: it is a caption on air asserting something untrue.
  const [activeCameraId, setActiveCameraId] = useState<string>(
    initialState?.activeCameraId ?? ""
  );
  const [activeRoomKey, setActiveRoomKey] = useState<string>(
    initialState?.activeRoomKey ?? ""
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
  const [activeChaosItem, setActiveChaosItem] = useState<ActiveChaosItemPayload | null>(
    initialState?.activeChaosItem ?? null
  );
  // Measured audio for whatever is ON AIR, straight from the director state
  // response. Not simulated, and not another room's — see directorStateHttp.
  const [programAudio, setProgramAudio] = useState<{
    peak: number | null;
    isSpeaking: boolean;
  }>({ peak: null, isSpeaking: false });
  const [program, setProgram] = useState<DirectorProgramSnapshot | null>(null);

  const dwellReceivedAtRef = useRef<number>(Date.now());
  const dwellBaseRef = useRef<number>(initialState?.dwellSecondsRemaining ?? 15);
  const activeCameraIdRef = useRef(activeCameraId);
  activeCameraIdRef.current = activeCameraId;
  // Heartbeats repeat the same crop. Handing React an equal-but-new object
  // re-rendered every page holding this hook (all of Tank) for nothing.
  const setPtzIfChanged = (next: VirtualPtzState | null) =>
    setPtzState((prev) => (samePtz(prev, next) ? prev : next));
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
      // The field is the final programme crop. Automatic Follow/Group/Animal
      // framing publishes it too; treating it as manual-only is what made the
      // staff preview disagree with both actual outputs.
      setPtzIfChanged(state.ptzState ?? null);
      setActiveChaosItem(state.activeChaosItem ?? null);
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
        if (payload?.audio) {
          setProgramAudio({
            peak: typeof payload.audio.peak === "number" ? payload.audio.peak : null,
            isSpeaking: Boolean(payload.audio.isSpeaking),
          });
        }
      } catch {
        // Realtime remains the fast path; the next poll retries the durable state.
      }
    };

    channel
      .on("broadcast", { event: "director_cut" }, (payload) => {
        const state = payload.payload as ServerDirectorState;
        if (state) applyState(state);
      })
      .on("broadcast", { event: "director_frame" }, (payload) => {
        const framing = payload.payload as {
          cameraId?: string;
          ptzState?: VirtualPtzState | null;
        };
        // A crop belongs to one source frame. A delayed event from the room
        // the Director just left must never be applied to the new room.
        if (framing?.cameraId === activeCameraIdRef.current) {
          setPtzIfChanged(framing.ptzState ?? null);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void refreshState();
      });

    // Fetch immediately, not only once realtime connects.
    //
    // The subscribe callback was the ONLY thing that triggered the first
    // load, so a slow websocket - or one that never connects - left every
    // overlay on its initial state until the 5s poll happened to fire. On a
    // browser source that is seconds of wrong caption on air, for a value
    // that was one HTTP request away the whole time.
    void refreshState();

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
    programAudio,
    activeChaosItem,
  };
}

function samePtz(a: VirtualPtzState | null, b: VirtualPtzState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.zoomFactor === b.zoomFactor &&
    a.panOffsetX === b.panOffsetX &&
    a.panOffsetY === b.panOffsetY &&
    a.speedMode === b.speedMode &&
    a.smoothness === b.smoothness
  );
}
