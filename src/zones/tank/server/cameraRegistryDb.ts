import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CameraAudioMode,
  CameraAudioStatus,
  RoomAudioOutputKind,
  RoomVisibilityPolicy,
  TankAudioSource,
} from "../contracts";
import type { CameraAudioAssignment } from "./audioPolicy";
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
  roomScope?: string;
  tags?: string[];
  audioMode?: CameraAudioMode;
  audioStatus?: CameraAudioStatus;
  audioWarning?: string | null;
};

const audioAssignmentFallback = new Map<string, CameraAudioAssignment>();

export type CameraPresentation = {
  description: string;
  accent: string;
  location: string;
  priority: number;
};

const DEFAULT_PRESENTATION: CameraPresentation = {
  description: "",
  accent: "from-slate-700/60 via-slate-900/70 to-black",
  location: "",
  priority: 0,
};

const presentationFallback = new Map<string, CameraPresentation>();

const audioSourcesFallback: TankAudioSource[] = [
  { id: "house-ambient-mic", name: "House Ambient Microphone (Room 1)", roomScope: "game-room", online: false, codec: null, channels: null, sampleRateHz: null, tags: [], kind: "house-mic", connectionHint: null },
  { id: "house-main-mic", name: "House Main Audio (Mixer Line Out)", roomScope: "house", online: false, codec: null, channels: null, sampleRateHz: null, tags: ["shared-audio"], kind: "line-in", connectionHint: null },
  { id: "ip-room-cam-audio", name: "Game Room Camera Audio", roomScope: "game-room", online: false, codec: null, channels: null, sampleRateHz: null, tags: [], kind: "ip-mic", connectionHint: null },
  { id: "oc-setup-cam-audio", name: "OC Setup Camera Audio", roomScope: "game-room", online: false, codec: null, channels: null, sampleRateHz: null, tags: [], kind: "ip-mic", connectionHint: null },
];

const DEFAULT_DB_TIMEOUT =
  process.env.NODE_ENV === "test" || !process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 250
    : 1500;

function withDbTimeout<T>(promise: PromiseLike<T>, timeoutMs = DEFAULT_DB_TIMEOUT): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
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
          bitrate_kbps: Math.round(state.bitrateKbps ?? 0),
          latency_ms: state.latencyMs !== null && state.latencyMs !== undefined ? Math.round(state.latencyMs) : null,
          room_scope: state.roomScope ?? "unscoped",
          tags: state.tags ?? [],
          audio_mode: state.audioMode ?? "auto",
          audio_status: state.audioStatus ?? "probe-required",
          audio_warning: state.audioWarning ?? null,
        },
        { onConflict: "camera_id" },
      ),
    );
  } catch (err) {
    console.warn("[cameraRegistryDb] Database sync warning:", err);
  }
}

export type CameraAudioConfig = {
  audioMode: "native" | "external" | "muted";
  hasNativeAudio: boolean;
  audioSourceId: string | null;
  audioSourceName: string | null;
};

const DEFAULT_AUDIO_CONFIG: CameraAudioConfig = {
  audioMode: "native",
  hasNativeAudio: true,
  audioSourceId: "self",
  audioSourceName: "Camera Native Audio",
};

// Operator-set audio routing (audio_mode / has_native_audio) is read back
// here but deliberately NEVER written by saveCameraLifecycleState above —
// that function runs on every telemetry poll and would otherwise stomp an
// admin's choice back to defaults on the next poll. Only
// actions.ts#setCameraAudioConfig writes these two columns.
export async function loadCameraAudioConfig(
  cameraId: string,
): Promise<CameraAudioConfig> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .select("audio_mode, has_native_audio, audio_source_id, audio_source_name")
        .eq("camera_id", cameraId)
        .maybeSingle(),
    );

    if (error || !data) return DEFAULT_AUDIO_CONFIG;

    return {
      audioMode: (data.audio_mode as CameraAudioConfig["audioMode"]) ?? "native",
      hasNativeAudio: data.has_native_audio ?? true,
      audioSourceId: data.audio_source_id ?? "self",
      audioSourceName: data.audio_source_name ?? "Camera Native Audio",
    };
  } catch {
    return DEFAULT_AUDIO_CONFIG;
  }
}

export async function loadCameraAudioAssignment(
  cameraId: string,
): Promise<CameraAudioAssignment | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .select("audio_source_id, audio_source_name, native_audio_muted, cross_room_audio_confirmed")
        .eq("camera_id", cameraId)
        .maybeSingle(),
    );
    if (error || !data) return audioAssignmentFallback.get(cameraId) ?? null;
    const assignment: CameraAudioAssignment = {
      audioSourceId:
        data.audio_source_id && data.audio_source_id !== "self"
          ? data.audio_source_id
          : null,
      audioSourceName:
        data.audio_source_id && data.audio_source_id !== "self"
          ? data.audio_source_name ?? null
          : null,
      nativeAudioMuted: data.native_audio_muted === true,
      crossRoomConfirmed: data.cross_room_audio_confirmed === true,
    };
    audioAssignmentFallback.set(cameraId, assignment);
    return assignment;
  } catch {
    return audioAssignmentFallback.get(cameraId) ?? null;
  }
}

export async function loadTankAudioSources(): Promise<TankAudioSource[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_audio_sources")
        .select("id, name, room_scope, online, codec, channels, sample_rate_hz, tags, kind, connection_hint, stream_url")
        .order("name"),
    );
    if (error || !data?.length) return audioSourcesFallback;
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      roomScope: row.room_scope ?? "unscoped",
      online: row.online === true,
      codec: row.codec ?? null,
      channels: row.channels ?? null,
      sampleRateHz: row.sample_rate_hz ?? null,
      tags: Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      kind: row.kind ?? undefined,
      connectionHint: row.connection_hint ?? null,
      streamUrl: row.stream_url ?? row.connection_hint ?? null,
    }));
  } catch {
    return audioSourcesFallback;
  }
}

export async function createTankAudioSource(input: {
  id: string;
  name: string;
  roomScope: string;
  kind: "ip-mic" | "line-in" | "house-mic";
  connectionHint: string | null;
  streamUrl?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("tank_audio_sources").insert({
    id: input.id,
    name: input.name,
    room_scope: input.roomScope,
    kind: input.kind,
    connection_hint: input.connectionHint,
    stream_url: input.streamUrl ?? input.connectionHint,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateTankAudioSource(input: {
  id: string;
  name: string;
  roomScope: string;
  kind: "ip-mic" | "line-in" | "house-mic";
  connectionHint: string | null;
  streamUrl?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tank_audio_sources")
    .update({
      name: input.name,
      room_scope: input.roomScope,
      kind: input.kind,
      connection_hint: input.connectionHint,
      stream_url: input.streamUrl ?? input.connectionHint,
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  if (!data) return { success: false, error: "Audio source was not found." };
  return { success: true };
}

export async function deleteTankAudioSource(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("tank_audio_sources").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function saveCameraAudioAssignment(input: {
  cameraId: string;
  source: TankAudioSource | null;
  nativeAudioMuted: boolean;
  crossRoomConfirmed: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const assignment: CameraAudioAssignment = {
    audioSourceId: input.source?.id ?? null,
    audioSourceName: input.source?.name ?? null,
    nativeAudioMuted: input.nativeAudioMuted,
    crossRoomConfirmed: input.crossRoomConfirmed,
  };
  audioAssignmentFallback.set(input.cameraId, assignment);

  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .update({
          audio_source_id: assignment.audioSourceId,
          audio_source_name: assignment.audioSourceName,
          native_audio_muted: assignment.nativeAudioMuted,
          cross_room_audio_confirmed: assignment.crossRoomConfirmed,
        })
        .eq("camera_id", input.cameraId)
        .select("camera_id")
        .maybeSingle(),
    );
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Camera registry row was not found." };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Audio assignment failed.",
    };
  }
}

// Curated by an admin (Config tab), never touched by the telemetry poll —
// same reasoning as loadCameraAudioAssignment above: a high-frequency write
// path must never stomp a human's presentation choices back to defaults.
export async function loadCameraPresentation(
  cameraId: string,
): Promise<CameraPresentation> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .select("description, accent, location, priority")
        .eq("camera_id", cameraId)
        .maybeSingle(),
    );
    if (error || !data) return presentationFallback.get(cameraId) ?? DEFAULT_PRESENTATION;

    const presentation: CameraPresentation = {
      description: data.description ?? DEFAULT_PRESENTATION.description,
      accent: data.accent ?? DEFAULT_PRESENTATION.accent,
      location: data.location ?? DEFAULT_PRESENTATION.location,
      priority: data.priority ?? DEFAULT_PRESENTATION.priority,
    };
    presentationFallback.set(cameraId, presentation);
    return presentation;
  } catch {
    return presentationFallback.get(cameraId) ?? DEFAULT_PRESENTATION;
  }
}

export async function saveCameraPresentation(input: {
  cameraId: string;
  description: string;
  accent: string;
  location: string;
  priority: number;
}): Promise<{ success: boolean; error?: string }> {
  const presentation: CameraPresentation = {
    description: input.description,
    accent: input.accent,
    location: input.location,
    priority: input.priority,
  };
  presentationFallback.set(input.cameraId, presentation);

  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_camera_registry")
        .update({
          description: presentation.description,
          accent: presentation.accent,
          location: presentation.location,
          priority: presentation.priority,
        })
        .eq("camera_id", input.cameraId)
        .select("camera_id")
        .maybeSingle(),
    );
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Camera registry row was not found." };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Presentation save failed.",
    };
  }
}

export type RoomPresentationRow = {
  roomKey: string;
  title: string | null;
  eyebrow: string | null;
  description: string | null;
  tags: string[];
  visibilityPolicy: RoomVisibilityPolicy | null;
  audioOutputKind: RoomAudioOutputKind;
  audioOutputConfig: Record<string, unknown>;
  audioInputSourceId: string | null;
};

const roomPresentationFallback = new Map<string, RoomPresentationRow>();

// Small table (one row per roomScope in active use) — a full read is cheap
// and lets roomProjection.ts merge curation onto every derived room in one
// pass instead of one query per room.
export async function loadRoomPresentation(): Promise<RoomPresentationRow[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await withDbTimeout(
      supabase
        .from("tank_rooms")
        .select(
          "room_key, title, eyebrow, description, tags, visibility_policy, audio_output_kind, audio_output_config, audio_input_source_id",
        ),
    );
    if (error || !data) return Array.from(roomPresentationFallback.values());

    const rows: RoomPresentationRow[] = data.map((row) => ({
      roomKey: row.room_key,
      title: row.title ?? null,
      eyebrow: row.eyebrow ?? null,
      description: row.description ?? null,
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
      visibilityPolicy: (row.visibility_policy as RoomVisibilityPolicy | null) ?? null,
      audioOutputKind: (row.audio_output_kind as RoomAudioOutputKind | null) ?? "embedded",
      audioOutputConfig: (row.audio_output_config as Record<string, unknown> | null) ?? {},
      audioInputSourceId: row.audio_input_source_id ?? null,
    }));
    roomPresentationFallback.clear();
    for (const row of rows) roomPresentationFallback.set(row.roomKey, row);
    return rows;
  } catch {
    return Array.from(roomPresentationFallback.values());
  }
}

export async function saveRoomPresentation(input: {
  roomKey: string;
  title: string;
  eyebrow: string;
  description: string;
  tags: string[];
  visibilityPolicy: RoomVisibilityPolicy | null;
  audioOutputKind?: RoomAudioOutputKind;
  audioOutputConfig?: Record<string, unknown>;
  audioInputSourceId?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createAdminClient();
    const { error } = await withDbTimeout(
      supabase.from("tank_rooms").upsert(
        {
          // tank_rooms predates the presentation projection and still keeps
          // id/slug/title as required legacy columns. Supplying all three
          // makes creation through the current room_key API valid while the
          // forward migration preserves existing rows in place.
          id: input.roomKey,
          slug: input.roomKey,
          room_key: input.roomKey,
          title: input.title || input.roomKey,
          eyebrow: input.eyebrow || null,
          description: input.description || null,
          tags: input.tags,
          visibility_policy: input.visibilityPolicy,
          ...(input.audioOutputKind ? { audio_output_kind: input.audioOutputKind } : {}),
          ...(input.audioOutputConfig ? { audio_output_config: input.audioOutputConfig } : {}),
          ...(input.audioInputSourceId !== undefined ? { audio_input_source_id: input.audioInputSourceId } : {}),
        },
        { onConflict: "room_key" },
      ),
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Room presentation save failed.",
    };
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
