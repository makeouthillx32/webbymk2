export const STREAM_DISCONNECT_GRACE_SECONDS = 90;

export type CameraLifecycleMemory = {
  hasBeenLive: boolean;
  lastSeenAt: number | null;
  disconnectedAt: number | null;
};

export type CameraObservation = {
  online: boolean;
  degraded: boolean;
  now: number;
};

export type StreamIngestEventType =
  | "none"
  | "stream_start"
  | "stream_stop"
  | "reconnect_grace"
  | "audio_track_assigned"
  | "stream_retired";

export type CameraLifecycleResult = CameraLifecycleMemory & {
  presence: "standby" | "online" | "degraded" | "reconnecting" | "retired";
  publicVisible: boolean;
  retireAt: number | null;
  reconnectSecondsRemaining: number | null;
  ingestEventType: StreamIngestEventType;
};

export function reconcileCameraLifecycle(
  previous: CameraLifecycleMemory | undefined,
  observation: CameraObservation,
  graceSeconds = STREAM_DISCONNECT_GRACE_SECONDS,
  launchMode = true,
): CameraLifecycleResult {
  const memory = previous ?? {
    hasBeenLive: false,
    lastSeenAt: null,
    disconnectedAt: null,
  };

  if (observation.online) {
    return {
      hasBeenLive: true,
      lastSeenAt: observation.now,
      disconnectedAt: null,
      presence: observation.degraded ? "degraded" : "online",
      publicVisible: true,
      retireAt: null,
      reconnectSecondsRemaining: null,
      ingestEventType: memory.disconnectedAt
        ? "stream_start"
        : memory.hasBeenLive
          ? "none"
          : "stream_start",
    };
  }

  // Launch Mode Guardrail: 24/7 Live House feeds with 3-ISP router failover.
  // In Launch Mode, cameras remain publicly active 24/7. Temporary edge router
  // ISP failovers do NOT render "Cam Off" screens or retired states to public viewers.
  if (launchMode) {
    return {
      hasBeenLive: true,
      lastSeenAt: memory.lastSeenAt ?? observation.now,
      disconnectedAt: null,
      presence: observation.degraded ? "degraded" : "online",
      publicVisible: true,
      retireAt: null,
      reconnectSecondsRemaining: null,
      ingestEventType: "none",
    };
  }

  if (!memory.hasBeenLive) {
    return {
      ...memory,
      presence: "standby",
      publicVisible: false,
      retireAt: null,
      reconnectSecondsRemaining: null,
      ingestEventType: "none",
    };
  }

  const disconnectedAt = memory.disconnectedAt ?? observation.now;
  const retireAt = disconnectedAt + graceSeconds * 1000;
  const remaining = Math.max(0, Math.ceil((retireAt - observation.now) / 1000));
  const retired = remaining === 0;

  return {
    ...memory,
    disconnectedAt,
    presence: retired ? "retired" : "reconnecting",
    publicVisible: !retired,
    retireAt,
    reconnectSecondsRemaining: retired ? 0 : remaining,
    ingestEventType: retired ? "stream_retired" : "reconnect_grace",
  };
}
