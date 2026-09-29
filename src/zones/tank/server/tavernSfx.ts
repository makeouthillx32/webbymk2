"use server";

// Tank Tavern — Bartender-triggered safe-room SFX. Self-approves like staff
// dispatch does today (audioAdminDispatchHttp.ts): enqueue then immediately
// moderate-approve with the same actor, priority 250 — between ordinary
// viewer requests (0) and staff dispatch (500), since a sound only reaches
// this path once staff already vetted it via tank_sfx_library.tavern_enabled.
// Allowance/cooldown are shift-scoped plain columns (sfx_allowance_remaining,
// sfx_last_used_at on tank_tavern_shifts), not the JSON-map cooldown idiom
// used elsewhere — decremented optimistically before queuing and restored on
// any pre-playback failure, never after a successful broadcast.

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { TavernActionResult } from "../tavernTypes";

type AudioRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;

export async function triggerTavernSfxAction(soundKey: string): Promise<TavernActionResult & { requestId?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };
  if (!soundKey.trim()) return { success: false, error: "Pick a sound effect first." };

  const admin = createAdminClient();

  const { data: shift } = await admin
    .from("tank_tavern_shifts")
    .select("id, bartender_id, sfx_allowance_remaining, sfx_last_used_at")
    .eq("status", "active")
    .maybeSingle();
  if (!shift || shift.bartender_id !== user.id) {
    return { success: false, error: "Only the current Bartender can trigger Tavern SFX." };
  }
  if (shift.sfx_allowance_remaining <= 0) {
    return { success: false, error: "No SFX charges left this shift." };
  }

  const { data: cfg } = await admin.from("tank_tavern_config").select("sfx_cooldown_sec").limit(1).maybeSingle();
  const cooldownSec = cfg?.sfx_cooldown_sec ?? 20;
  if (shift.sfx_last_used_at) {
    const elapsedMs = Date.now() - new Date(shift.sfx_last_used_at).getTime();
    if (elapsedMs < cooldownSec * 1000) {
      return { success: false, error: `SFX is cooling down (${Math.ceil((cooldownSec * 1000 - elapsedMs) / 1000)}s left).` };
    }
  }

  const { data: sfx } = await admin
    .from("tank_sfx_library")
    .select("id, file_url, default_volume, duration_ms, is_active, tavern_enabled")
    .eq("sound_key", soundKey)
    .maybeSingle();
  if (!sfx || !sfx.is_active || !sfx.tavern_enabled) {
    return { success: false, error: "That sound isn't available in the Tavern." };
  }

  // Optimistic guard: only decrement if the row is still in the state we
  // just read (prevents two rapid clicks from both passing the check above
  // and double-spending the last charge).
  const { data: claimed, error: claimError } = await admin
    .from("tank_tavern_shifts")
    .update({ sfx_allowance_remaining: shift.sfx_allowance_remaining - 1, sfx_last_used_at: new Date().toISOString() })
    .eq("id", shift.id)
    .eq("sfx_allowance_remaining", shift.sfx_allowance_remaining)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) {
    return { success: false, error: "SFX charge is unavailable right now — try again." };
  }

  const rpc = admin.rpc.bind(admin) as unknown as AudioRpc;
  const queued = await rpc("tank_enqueue_audio_request", {
    p_user_id: user.id,
    p_kind: "sfx",
    p_message: null,
    p_voice_or_sound_key: soundKey,
    p_target_type: "website",
    p_target_room_key: null,
    p_cost: 0,
    p_priority: 250,
    p_payload: {},
    p_inventory_item_slug: null,
    p_sfx_id: sfx.id,
  });
  if (queued.error || !queued.data) {
    await admin.from("tank_tavern_shifts").update({ sfx_allowance_remaining: shift.sfx_allowance_remaining }).eq("id", shift.id);
    return { success: false, error: queued.error?.message ?? "Could not queue that sound." };
  }
  const requestId = String(queued.data.id);

  const approved = await rpc("tank_moderate_audio_request", {
    p_request_id: requestId,
    p_moderator_id: user.id,
    p_decision: "approve",
  });
  if (approved.error) {
    await admin.from("tank_tavern_shifts").update({ sfx_allowance_remaining: shift.sfx_allowance_remaining }).eq("id", shift.id);
    return { success: false, error: approved.error.message };
  }

  const channel = admin.channel("tank:audio:website");
  await channel.send({
    type: "broadcast",
    event: "play",
    payload: {
      requestId,
      kind: "sfx",
      message: null,
      voiceOrSoundKey: soundKey,
      audioUrl: sfx.file_url,
      targetRoomKey: null,
    },
  });
  await admin.removeChannel(channel);
  await rpc("tank_complete_client_audio_request", { p_request_id: requestId });

  return { success: true, requestId };
}
