import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TankAudioRequestKind, TankSfxLibraryEntry } from "../contracts";

const ROOM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SOUND_KEY = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const ITEM_SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const DEFAULT_TTS_COST = 75;
const requestWindows = new Map<string, number>();

type AudioTarget = { type: "website" } | { type: "room"; roomKey: string };

type QueueInput = {
  kind: TankAudioRequestKind;
  message: string | null;
  key: string;
  target: AudioTarget;
  cost: number;
  priority?: number;
  payload?: Record<string, unknown>;
  inventoryItemSlug?: string | null;
  sfxId?: string | null;
};

function jsonError(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function requireSameSite(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.toLowerCase().startsWith("application/json");
}

async function readJson(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (!requireSameSite(request)) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseTarget(input: unknown): AudioTarget | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const target = input as Record<string, unknown>;
  if (target.type === "website") return { type: "website" };
  if (target.type === "room" && typeof target.roomKey === "string" && ROOM_KEY.test(target.roomKey)) {
    return { type: "room", roomKey: target.roomKey };
  }
  return null;
}

async function getSignedInUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function settingEnabled(key: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tank_platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  return (data?.value as { enabled?: boolean } | null)?.enabled === true;
}

function rateLimit(userId: string) {
  const now = Date.now();
  const previous = requestWindows.get(userId) ?? 0;
  if (now - previous < 1_500) return false;
  requestWindows.set(userId, now);
  if (requestWindows.size > 5_000) {
    for (const [key, value] of requestWindows) {
      if (now - value > 60_000) requestWindows.delete(key);
    }
  }
  return true;
}

async function queueAudio(userId: string, input: QueueInput) {
  const admin = createAdminClient();
  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  return rpc("tank_enqueue_audio_request", {
    p_user_id: userId,
    p_kind: input.kind,
    p_message: input.message,
    p_voice_or_sound_key: input.key,
    p_target_type: input.target.type,
    p_target_room_key: input.target.type === "room" ? input.target.roomKey : null,
    p_cost: input.cost,
    p_priority: input.priority ?? 0,
    p_payload: input.payload ?? {},
    p_inventory_item_slug: input.inventoryItemSlug ?? null,
    p_sfx_id: input.sfxId ?? null,
  });
}

async function announceQueuedAudio(input: {
  requestId: string;
  roomKey: string;
  body: string;
  itemSlug?: string | null;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tank_chat_messages")
    .insert({
      room_id: input.roomKey,
      user_id: null,
      user_name: "HOUSE",
      user_role: "system",
      body: input.body,
      message_type: "house_event",
      item_slug: input.itemSlug ?? null,
      metadata: { audioRequestId: input.requestId },
    })
    .select("id, created_at")
    .single();
  if (!data) return;
  const channel = admin.channel(`room:${input.roomKey}:chat`);
  try {
    await channel.httpSend("new_message", {
      id: data.id,
      user: "HOUSE",
      body: input.body,
      time: new Date(data.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      messageType: "house_event",
      metadata: { audioRequestId: input.requestId },
    });
  } finally {
    await admin.removeChannel(channel);
  }
}

export async function handleSfxGet() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_sfx_library")
    .select("id, sound_key, name, file_url, category, default_volume, duration_ms, is_premium, required_item_slug, token_cost")
    .eq("is_active", true)
    .order("category")
    .order("name");
  if (error) return jsonError("The sound library is temporarily unavailable.", 503);
  const sfx: TankSfxLibraryEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    soundKey: row.sound_key,
    name: row.name,
    fileUrl: row.file_url,
    category: row.category,
    defaultVolume: row.default_volume,
    durationMs: row.duration_ms,
    isPremium: row.is_premium,
    requiredItemSlug: row.required_item_slug,
    tokenCost: row.token_cost,
  }));
  return NextResponse.json({ success: true, sfx }, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
  });
}

export async function handleSfxPlay(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return jsonError("A same-site JSON body is required.", 400);
  const user = await getSignedInUser();
  if (!user) return jsonError("Sign in required to play a sound.", 401);
  if (!rateLimit(user.id)) return jsonError("Please wait a moment before triggering another sound.", 429);
  if (!(await settingEnabled("sfx_enabled"))) return jsonError("SFX are currently disabled.", 409);
  if (typeof body.soundKey !== "string" || !SOUND_KEY.test(body.soundKey)) {
    return jsonError("Choose a valid sound.", 400);
  }
  const target = parseTarget(body.target);
  if (!target) return jsonError("Choose a valid audio target.", 400);

  const admin = createAdminClient();
  const { data: sfx } = await admin
    .from("tank_sfx_library")
    .select("id, sound_key, name, file_url, default_volume, duration_ms, is_premium, required_item_slug, token_cost")
    .eq("sound_key", body.soundKey)
    .eq("is_active", true)
    .maybeSingle();
  if (!sfx) return jsonError("That sound is unavailable.", 404);
  const result = await queueAudio(user.id, {
    kind: "sfx",
    message: null,
    key: sfx.sound_key,
    target,
    cost: sfx.required_item_slug ? 0 : sfx.token_cost,
    inventoryItemSlug: sfx.required_item_slug,
    sfxId: sfx.id,
    payload: {
      fileUrl: sfx.file_url,
      defaultVolume: sfx.default_volume,
      durationMs: sfx.duration_ms,
    },
  });
  if (result.error || !result.data) return jsonError(result.error?.message ?? "Could not queue the sound.", 400);
  const requestId = String(result.data.id);
  if (target.type === "room") {
    await announceQueuedAudio({ requestId, roomKey: target.roomKey, body: `[AUDIO] A viewer queued “${sfx.name}” for this room.` });
  }
  return NextResponse.json({ success: true, requestId, status: result.data.status }, { status: 202 });
}

export async function handleTtsGenerate(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return jsonError("A same-site JSON body is required.", 400);
  const user = await getSignedInUser();
  if (!user) return jsonError("Sign in required to use TTS.", 401);
  if (!rateLimit(user.id)) return jsonError("Please wait a moment before sending another request.", 429);
  if (!(await settingEnabled("tts_enabled"))) return jsonError("TTS is currently disabled.", 409);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 250) return jsonError("TTS must contain between 1 and 250 characters.", 400);
  const voice = typeof body.voice === "string" && /^[a-z0-9_-]{1,64}$/i.test(body.voice) ? body.voice : "default";
  const target = parseTarget(body.target);
  if (!target) return jsonError("Choose a valid audio target.", 400);
  const itemSlug = typeof body.inventoryItemSlug === "string" && ITEM_SLUG.test(body.inventoryItemSlug)
    ? body.inventoryItemSlug
    : null;
  const result = await queueAudio(user.id, {
    kind: "tts",
    message: text,
    key: voice,
    target,
    cost: itemSlug ? 0 : DEFAULT_TTS_COST,
    inventoryItemSlug: itemSlug,
    payload: { voiceKey: voice },
  });
  if (result.error || !result.data) return jsonError(result.error?.message ?? "Could not queue TTS.", 400);
  const requestId = String(result.data.id);
  if (target.type === "room") {
    await announceQueuedAudio({ requestId, roomKey: target.roomKey, body: "[AUDIO] A viewer queued a TTS message for this room." });
  }
  return NextResponse.json({ success: true, requestId, status: result.data.status }, { status: 202 });
}

export async function handleHazardUse(request: NextRequest) {
  const body = await readJson(request);
  if (!body) return jsonError("A same-site JSON body is required.", 400);
  const user = await getSignedInUser();
  if (!user) return jsonError("Sign in required to use an item.", 401);
  if (!rateLimit(user.id)) return jsonError("Please wait a moment before using another item.", 429);
  if (!(await settingEnabled("hazard_audio_enabled"))) return jsonError("Room hazards are currently disabled.", 409);
  const itemSlug = typeof body.itemSlug === "string" ? body.itemSlug : "";
  const roomKey = typeof body.roomKey === "string" ? body.roomKey : "";
  if (!ITEM_SLUG.test(itemSlug) || !ROOM_KEY.test(roomKey)) return jsonError("Choose a valid hazard and room.", 400);

  const admin = createAdminClient();
  const { data: item } = await admin
    .from("tank_inventory_items")
    .select("id, slug, name, audio_effect_type, audio_effect_payload")
    .eq("slug", itemSlug)
    .eq("is_active", true)
    .eq("audio_effect_type", "hazard_effect")
    .maybeSingle();
  if (!item) return jsonError("That hazard item is unavailable.", 404);
  const effect = (item.audio_effect_payload ?? {}) as Record<string, unknown>;
  const result = await queueAudio(user.id, {
    kind: "hazard_effect",
    message: null,
    key: item.slug,
    target: { type: "room", roomKey },
    cost: 0,
    priority: 100,
    inventoryItemSlug: item.slug,
    payload: {
      pitchFactor: typeof effect.pitchFactor === "number" ? Math.max(0.5, Math.min(2, effect.pitchFactor)) : 1,
      speed: typeof effect.speed === "number" ? Math.max(0.5, Math.min(2, effect.speed)) : 1,
      durationSeconds: typeof effect.durationSeconds === "number" ? Math.max(1, Math.min(300, effect.durationSeconds)) : 30,
      sourceSoundKey: typeof effect.sourceSoundKey === "string" ? effect.sourceSoundKey : null,
    },
  });
  if (result.error || !result.data) return jsonError(result.error?.message ?? "Could not trigger the hazard.", 400);
  const requestId = String(result.data.id);
  await announceQueuedAudio({
    requestId,
    roomKey,
    itemSlug: item.slug,
    body: `[HAZARD] A viewer released ${item.name} in this room!`,
  });
  return NextResponse.json({ success: true, requestId, status: result.data.status }, { status: 202 });
}
