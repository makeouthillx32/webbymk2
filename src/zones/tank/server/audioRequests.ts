"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  TankAudioPlaybackEvent,
  TankAudioRequest,
  TankAudioRequestKind,
} from "../contracts";

// Flat per-request cost, matching the reference platform's fixed-cost model
// (screenshots showed a flat cost regardless of message/sound chosen). Revisit
// if per-voice/per-sound pricing is ever wanted — nothing here assumes flat.
const TTS_COST = 75;
const SFX_COST = 75;

export type AudioRequestTarget = { type: "website" } | { type: "room"; roomKey: string };

export type SubmitAudioRequestResult = {
  success: boolean;
  requestId?: string;
  error?: string;
};

async function getSettingEnabled(key: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tank_platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return false;
  const val = data.value as { enabled?: boolean };
  return val.enabled === true;
}

async function submitAudioRequest(input: {
  kind: TankAudioRequestKind;
  message: string | null;
  voiceOrSoundKey: string;
  target: AudioRequestTarget;
  cost: number;
}): Promise<SubmitAudioRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  const { data: request, error } = await rpc("tank_enqueue_audio_request", {
    p_user_id: user.id,
    p_kind: input.kind,
    p_message: input.message,
    p_voice_or_sound_key: input.voiceOrSoundKey,
    p_target_type: input.target.type,
    p_target_room_key: input.target.type === "room" ? input.target.roomKey : null,
    p_cost: input.cost,
    p_priority: 0,
    p_payload: {},
    p_inventory_item_slug: null,
    p_sfx_id: null,
  });
  return error || !request
    ? { success: false, error: error?.message ?? "Failed to submit request." }
    : { success: true, requestId: String(request.id) };
}

export async function requestTts(
  message: string,
  voice: string,
  target: AudioRequestTarget,
): Promise<SubmitAudioRequestResult> {
  const trimmed = message.trim();
  if (!trimmed) return { success: false, error: "Message cannot be empty." };
  if (trimmed.length > 250) return { success: false, error: "Message is too long (250 characters max)." };
  if (!(await getSettingEnabled("tts_enabled"))) {
    return { success: false, error: "TTS is currently disabled — please wait until it's turned on by producers." };
  }
  return submitAudioRequest({ kind: "tts", message: trimmed, voiceOrSoundKey: voice, target, cost: TTS_COST });
}

export async function requestSfx(
  soundKey: string,
  target: AudioRequestTarget,
): Promise<SubmitAudioRequestResult> {
  if (!soundKey.trim()) return { success: false, error: "Pick a sound effect first." };
  if (!(await getSettingEnabled("sfx_enabled"))) {
    return { success: false, error: "SFX are currently disabled — please wait until it's turned on by producers." };
  }
  return submitAudioRequest({ kind: "sfx", message: null, voiceOrSoundKey: soundKey, target, cost: SFX_COST });
}

export type ModerateAudioRequestResult = { success: boolean; error?: string };

// Admin-only: approve broadcasts a play event to the request's target
// channel (tank:audio:website or tank:audio:room:<key>); reject refunds the
// charge via a new ledger row (never mutates the original transaction).
export async function moderateAudioRequest(
  requestId: string,
  decision: "approve" | "reject",
): Promise<ModerateAudioRequestResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  const role = (user.app_metadata?.role as string) ?? "";
  if (role !== "admin") return { success: false, error: "Admin only." };

  const admin = createAdminClient();
  const { data: request, error: fetchError } = await admin
    .from("tank_audio_requests")
    .select("id, user_id, kind, message, voice_or_sound_key, target_type, target_room_key, cost, status, payload")
    .eq("id", requestId)
    .maybeSingle();
  if (fetchError || !request) return { success: false, error: "Request not found." };
  if (request.status !== "pending") return { success: false, error: `Already ${request.status}.` };

  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  const moderation = await rpc("tank_moderate_audio_request", {
    p_request_id: requestId,
    p_moderator_id: user.id,
    p_decision: decision,
  });
  if (moderation.error) return { success: false, error: moderation.error.message };
  if (decision === "reject") return { success: true };

  let outputKind: string = "client-broadcast";
  if (request.target_type === "room" && request.target_room_key) {
    const { data: room } = await admin
      .from("tank_rooms")
      .select("audio_output_kind")
      .eq("room_key", request.target_room_key)
      .maybeSingle();
    outputKind = room?.audio_output_kind ?? "client-broadcast";
  }

  // Host Bluetooth jobs are claimed by the environment-node worker. Website
  // and client-broadcast jobs retain the existing browser playback path.
  if (request.target_type === "room" && outputKind === "host-bluetooth") {
    return { success: true };
  }

  const requestPayload = (request.payload ?? {}) as Record<string, unknown>;
  const payload: TankAudioPlaybackEvent = {
    requestId: request.id,
    kind: request.kind as TankAudioRequestKind,
    message: request.message,
    voiceOrSoundKey: request.voice_or_sound_key,
    audioUrl: typeof requestPayload.fileUrl === "string" ? requestPayload.fileUrl : null,
    targetRoomKey: request.target_room_key,
  };
  const channelName =
    request.target_type === "room" ? `tank:audio:room:${request.target_room_key}` : "tank:audio:website";
  const channel = admin.channel(channelName);
  await channel.send({ type: "broadcast", event: "play", payload });
  await rpc("tank_complete_client_audio_request", { p_request_id: request.id });

  return { success: true };
}

// Moderation queue for the admin page — deliberately unpaginated for now
// (a real backlog of pending TTS/SFX requests piling up is itself a signal
// something's wrong; this isn't meant to hold thousands of rows).
export async function listPendingAudioRequests(): Promise<TankAudioRequest[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (user.app_metadata?.role as string) !== "admin") return [];

  const admin = createAdminClient();
  const { data: requests, error } = await admin
    .from("tank_audio_requests")
    .select("id, user_id, kind, message, voice_or_sound_key, target_type, target_room_key, cost, status, priority, attempts, error_message, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !requests || requests.length === 0) return [];

  const userIds = Array.from(new Set(requests.map((r) => r.user_id)));
  const { data: profiles } = await admin
    .from("tank_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  const nameByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p.display_name ?? "Viewer"]));

  return requests.map((r) => ({
    id: r.id,
    userId: r.user_id,
    userName: nameByUserId.get(r.user_id) ?? "Viewer",
    kind: r.kind as TankAudioRequestKind,
    message: r.message,
    voiceOrSoundKey: r.voice_or_sound_key,
    targetType: r.target_type as "website" | "room",
    targetRoomKey: r.target_room_key,
    cost: r.cost,
    status: r.status as TankAudioRequest["status"],
    priority: r.priority,
    attempts: r.attempts,
    errorMessage: r.error_message,
    createdAt: r.created_at,
  }));
}
