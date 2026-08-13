import "server-only";

import { createAdminClient } from "@/utils/supabase/admin";
import type { CameraLifecycleMemory, StreamIngestEventType } from "./cameraLifecycle";

const memoryFallback = new Map<string, CameraLifecycleMemory>();
const ingestEventsFallback: Array<{
  id: string;
  cameraId: string;
  eventType: string;
  createdAt: string;
}> = [];

export type PersistedCameraState = {
  cameraId: string;
  streamKey?: string;
  name: string;
  protocol: string;
  presence: string;
  publicVisible: boolean;
  hasBeenLive: boolean;
  lastSeenAt: number | null;
  disconnectedAt: number | null;
  retireAt: number | null;
  keyFingerprint?: string;
  bitrateKbps?: number;
  latencyMs?: number | null;
  audioSourceId?: string;
  audioSourceName?: string;
};

const DEFAULT_DB_TIMEOUT =
  process.env.NODE_ENV === "test" || !process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 250
    : 1500;

function withDbTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_DB_TIMEOUT): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Database query timeout")), timeoutMs),
    ),
  ]);
}

export async function loadCameraLifecycleMemory(
  cameraId: string,
): Promise<CameraLifecycleMemory> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .select("has_been_live, last_seen_at, disconnected_at")
        .eq("camera_id", cameraId)
        .maybeSingle(),
    );

    if (error || !data) {
      return memoryFallback.get(cameraId) ?? {
        hasBeenLive: false,
        lastSeenAt: null,
        disconnectedAt: null,
      };
    }

    const memory: CameraLifecycleMemory = {
      hasBeenLive: data.has_been_live ?? false,
      lastSeenAt: data.last_seen_at ? new Date(data.last_seen_at).getTime() : null,
      disconnectedAt: data.disconnected_at
        ? new Date(data.disconnected_at).getTime()
        : null,
    };
    memoryFallback.set(cameraId, memory);
    return memory;
  } catch {
    return memoryFallback.get(cameraId) ?? {
      hasBeenLive: false,
      lastSeenAt: null,
      disconnectedAt: null,
    };
  }
}

export async function saveCameraLifecycleState(
  state: PersistedCameraState,
): Promise<void> {
  const memory: CameraLifecycleMemory = {
    hasBeenLive: state.hasBeenLive,
    lastSeenAt: state.lastSeenAt,
    disconnectedAt: state.disconnectedAt,
  };
  memoryFallback.set(state.cameraId, memory);

  try {
    const supabase = createAdminClient();
    await withDbTimeout(
      supabase.from("tank_camera_registry").upsert(
        {
          camera_id: state.cameraId,
          stream_key: state.streamKey ?? `sk_${state.cameraId}`,
          name: state.name,
          protocol: state.protocol,
          status: state.presence,
          public_visible: state.publicVisible,
          has_been_live: state.hasBeenLive,
          last_seen_at: state.lastSeenAt
            ? new Date(state.lastSeenAt).toISOString()
            : null,
          disconnected_at: state.disconnectedAt
            ? new Date(state.disconnectedAt).toISOString()
            : null,
          retire_at: state.retireAt
            ? new Date(state.retireAt).toISOString()
            : null,
          key_fingerprint: state.keyFingerprint ?? null,
          bitrate_kbps: state.bitrateKbps ?? 0,
          latency_ms: state.latencyMs ?? null,
          audio_source_id: state.audioSourceId ?? "self",
          audio_source_name: state.audioSourceName ?? "Camera Native Audio",
        },
        { onConflict: "camera_id" },
      ),
    );
  } catch (err) {
    console.warn("[cameraRegistryDb] Database sync warning:", err);
  }
}

export async function recordIngestEvent(event: {
  cameraId: string;
  eventType: StreamIngestEventType;
  details?: Record<string, unknown>;
}): Promise<void> {
  if (event.eventType === "none") return;

  const fallbackId = `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  ingestEventsFallback.push({
    id: fallbackId,
    cameraId: event.cameraId,
    eventType: event.eventType,
    createdAt: new Date().toISOString(),
  });

  try {
    const supabase = createAdminClient();
    await withDbTimeout(
      supabase.from("tank_ingest_events").insert({
        camera_id: event.cameraId,
        event_type: event.eventType,
        details: event.details ?? {},
      }),
    );
  } catch (err) {
    console.warn("[cameraRegistryDb] Failed to record ingest event in DB log:", err);
  }
}
