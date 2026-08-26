import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "./staffAuth";

const ROOM_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

export async function handleAdminAudioDispatch(request: NextRequest) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ success: false, error: "Staff access required." }, { status: 403 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 }); }
  const kind = body.kind === "tts" || body.kind === "sfx" ? body.kind : null;
  const target = typeof body.target === "string" ? body.target : "";
  if (!kind || (target !== "all" && !ROOM_KEY.test(target))) {
    return NextResponse.json({ success: false, error: "Invalid audio dispatch." }, { status: 400 });
  }

  const admin = createAdminClient();
  let roomKeys: string[] = [];
  if (target === "all") {
    const { data } = await admin.from("tank_rooms").select("room_key").eq("audio_output_kind", "host-bluetooth");
    roomKeys = (data ?? []).map((row) => row.room_key).filter(Boolean);
  } else {
    const { data } = await admin.from("tank_rooms").select("room_key, audio_output_kind").eq("room_key", target).maybeSingle();
    if (data?.audio_output_kind === "host-bluetooth") roomKeys = [data.room_key];
  }
  if (roomKeys.length === 0) {
    return NextResponse.json({ success: false, error: "No targeted room is configured for host Bluetooth audio." }, { status: 409 });
  }

  let key = "";
  let message: string | null = null;
  let payload: Record<string, unknown> = {};
  let sfxId: string | null = null;
  if (kind === "tts") {
    message = typeof body.text === "string" ? body.text.trim() : "";
    key = typeof body.voice === "string" && /^[a-z0-9_-]{1,64}$/i.test(body.voice) ? body.voice : "default";
    if (!message || message.length > 250) return NextResponse.json({ success: false, error: "TTS must contain between 1 and 250 characters." }, { status: 400 });
    payload = { voiceKey: key };
  } else {
    key = typeof body.soundKey === "string" ? body.soundKey : "";
    const { data: sfx } = await admin
      .from("tank_sfx_library")
      .select("id, file_url, default_volume, duration_ms")
      .eq("sound_key", key)
      .eq("is_active", true)
      .maybeSingle();
    if (!sfx) return NextResponse.json({ success: false, error: "That sound is unavailable." }, { status: 404 });
    sfxId = sfx.id;
    payload = { fileUrl: sfx.file_url, defaultVolume: sfx.default_volume, durationMs: sfx.duration_ms };
  }

  const rpc = admin.rpc.bind(admin) as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  const requestIds: string[] = [];
  for (const roomKey of roomKeys) {
    const queued = await rpc("tank_enqueue_audio_request", {
      p_user_id: staff.id,
      p_kind: kind,
      p_message: message,
      p_voice_or_sound_key: key,
      p_target_type: "room",
      p_target_room_key: roomKey,
      p_cost: 0,
      p_priority: 500,
      p_payload: payload,
      p_inventory_item_slug: null,
      p_sfx_id: sfxId,
    });
    if (queued.error || !queued.data) return NextResponse.json({ success: false, error: queued.error?.message ?? "Could not queue staff audio." }, { status: 400 });
    const requestId = String(queued.data.id);
    const approved = await rpc("tank_moderate_audio_request", {
      p_request_id: requestId,
      p_moderator_id: staff.id,
      p_decision: "approve",
    });
    if (approved.error) return NextResponse.json({ success: false, error: approved.error.message }, { status: 400 });
    requestIds.push(requestId);
  }
  return NextResponse.json({ success: true, requestIds, rooms: roomKeys }, { status: 202 });
}
