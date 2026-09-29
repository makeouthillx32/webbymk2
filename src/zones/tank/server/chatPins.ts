"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage } from "../contracts";

export type PinDurationHours = 3 | 12 | 24 | "indefinite";

export type PinnedChatMessage = {
  id: string;
  roomId: string;
  title?: string;
  body: string;
  pinnedBy: string;
  pinnedAt: number;
  expiresAt: number | null;
  durationHours: PinDurationHours;
  active: boolean;
};

const PIN_SETTING_PREFIX = "tank_pinned_msg_";

/**
 * Retrieves the active pinned message for a room.
 * Automatically deactivates expired pins.
 */
export async function getActivePinnedMessage(
  roomId: string = "global",
): Promise<PinnedChatMessage | null> {
  const adminSupabase = createAdminClient();
  const settingKey = `${PIN_SETTING_PREFIX}${roomId}`;

  try {
    const { data } = await adminSupabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", settingKey)
      .single();

    if (!data || !data.value) return null;

    const pin = data.value as PinnedChatMessage;
    if (!pin.active) return null;

    // Auto-expire if time has elapsed
    if (pin.expiresAt && Date.now() > pin.expiresAt) {
      pin.active = false;
      await adminSupabase.from("tank_platform_settings").upsert(
        {
          key: settingKey,
          value: pin,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      return null;
    }

    return pin;
  } catch {
    return null;
  }
}

/**
 * Pins a system announcement or important message to the top of chat.
 * Staff (Admin / Moderator) only.
 */
export async function pinChatMessage(
  roomId: string = "global",
  body: string,
  durationHours: PinDurationHours = 24,
  title: string = "SYSTEM ANNOUNCEMENT",
): Promise<{ success: boolean; pinned?: PinnedChatMessage; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { success: false, error: "Pinned message content cannot be empty." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, username, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") {
    return { success: false, error: "Staff permissions required to pin messages." };
  }

  const pinnedBy = profile?.display_name || profile?.username || "Admin";
  const now = Date.now();
  const durationMs =
    durationHours === "indefinite" ? null : durationHours * 60 * 60 * 1000;
  const expiresAt = durationMs ? now + durationMs : null;

  const pinnedMessage: PinnedChatMessage = {
    id: `pin-${now}-${Math.random().toString(36).slice(2, 7)}`,
    roomId,
    title: title.trim() || "SYSTEM ANNOUNCEMENT",
    body: trimmed,
    pinnedBy,
    pinnedAt: now,
    expiresAt,
    durationHours,
    active: true,
  };

  const settingKey = `${PIN_SETTING_PREFIX}${roomId}`;

  try {
    await admin.from("tank_platform_settings").upsert(
      {
        key: settingKey,
        value: pinnedMessage,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    // 1. Post an official SYSTEM CONSOLE notice into the chat feed
    const expiryDesc =
      durationHours === "indefinite"
        ? "pinned indefinitely"
        : `pinned for ${durationHours} hours`;

    const { data: msgData } = await admin
      .from("tank_chat_messages")
      .insert({
        room_id: roomId,
        user_id: null,
        user_name: "SYSTEM",
        user_role: "system",
        body: `📌 PINNED ANNOUNCEMENT (${expiryDesc}): ${trimmed}`,
        message_type: "system",
      })
      .select("id, created_at")
      .single();

    const consoleMsg: ChatMessage = {
      id: msgData?.id ?? pinnedMessage.id,
      user: "SYSTEM",
      body: `📌 PINNED ANNOUNCEMENT (${expiryDesc}): ${trimmed}`,
      time: new Date().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      messageType: "system",
    };

    // 2. Realtime broadcast pin update to all connected chat clients
    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "pin_updated",
      payload: pinnedMessage,
    });

    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: consoleMsg,
    });

    return { success: true, pinned: pinnedMessage };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to pin message." };
  }
}

export type SuperChatResult = {
  success: boolean;
  pinned?: PinnedChatMessage;
  error?: string;
  newBalance?: number;
};

const SUPER_CHAT_RATE_PER_MINUTE = 100;
const SUPER_CHAT_MIN_MINUTES = 2;
const SUPER_CHAT_MAX_MINUTES = 300; // 5 hours, matches the reference slider's top end

// Not exported: a "use server" module may only export async functions, and
// the client never needs an authoritative cost anyway — sendSuperChat below
// recomputes this itself from durationMinutes rather than trusting a
// client-supplied number.
function superChatCostForMinutes(durationMinutes: number): number {
  const minutes = Math.max(
    SUPER_CHAT_MIN_MINUTES,
    Math.min(SUPER_CHAT_MAX_MINUTES, Math.round(durationMinutes)),
  );
  return minutes * SUPER_CHAT_RATE_PER_MINUTE;
}

/**
 * Self-service paid pin — any signed-in viewer, not just staff. Reuses the
 * same tank_platform_settings pin slot and pin_updated broadcast as
 * pinChatMessage, so the pinned banner UI needs no changes to render either
 * kind. Charges tokens before writing the pin so a failed write never leaves
 * a pin nobody paid for.
 */
export async function sendSuperChat(
  roomId: string,
  body: string,
  durationMinutes: number,
): Promise<SuperChatResult> {
  const trimmed = body.trim();
  if (!trimmed) return { success: false, error: "Enter a message to super chat." };
  if (trimmed.length > 350) return { success: false, error: "Message exceeds 350 characters." };

  const minutes = Math.max(
    SUPER_CHAT_MIN_MINUTES,
    Math.min(SUPER_CHAT_MAX_MINUTES, Math.round(durationMinutes)),
  );
  const cost = minutes * SUPER_CHAT_RATE_PER_MINUTE;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to send a Super Chat." };

  const admin = createAdminClient();
  const [{ data: coreProfile }, { data: tankProfile }] = await Promise.all([
    admin.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle(),
    admin.from("tank_profiles").select("tokens").eq("user_id", user.id).maybeSingle(),
  ]);

  const balance = tankProfile?.tokens ?? 0;
  if (balance < cost) {
    return { success: false, error: `Not enough tokens — need ${cost}, you have ${balance}.` };
  }

  const pinnedBy = coreProfile?.display_name || coreProfile?.username || "Viewer";
  const now = Date.now();
  const expiresAt = now + minutes * 60 * 1000;

  const pinnedMessage: PinnedChatMessage = {
    id: `superchat-${now}-${Math.random().toString(36).slice(2, 7)}`,
    roomId,
    title: "SUPER CHAT",
    body: trimmed,
    pinnedBy,
    pinnedAt: now,
    expiresAt,
    // No fixed hour bucket applies to a per-minute purchase — expiresAt is
    // what actually governs the countdown/auto-expiry, this is display-only.
    durationHours: "indefinite",
    active: true,
  };

  const settingKey = `${PIN_SETTING_PREFIX}${roomId}`;

  try {
    const nextTokens = balance - cost;
    const { error: debitError } = await admin
      .from("tank_profiles")
      .update({ tokens: nextTokens, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (debitError) return { success: false, error: "Could not charge tokens for the Super Chat." };

    await admin.from("tank_token_transactions").insert({
      user_id: user.id,
      amount: -cost,
      reason: "Super Chat",
    });

    await admin.from("tank_platform_settings").upsert(
      { key: settingKey, value: pinnedMessage, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

    const durationLabel =
      minutes % 60 === 0 && minutes >= 60 ? `${minutes / 60}h` : `${minutes}m`;
    const consoleBody = `⭐ SUPER CHAT from ${pinnedBy} (pinned ${durationLabel}): ${trimmed}`;

    // message_type "system" requires user_id null / user_role "system" (DB
    // check constraint) — same reason pinChatMessage's console echo below is
    // authored as SYSTEM rather than the pinning user; pinnedBy in the banner
    // is where the payer's name actually shows.
    const { data: msgData } = await admin
      .from("tank_chat_messages")
      .insert({
        room_id: roomId,
        user_id: null,
        user_name: "SYSTEM",
        user_role: "system",
        body: consoleBody,
        message_type: "system",
        metadata: { superChat: true, cost, durationMinutes: minutes, paidBy: pinnedBy },
      })
      .select("id, created_at")
      .single();

    const consoleMsg: ChatMessage = {
      id: msgData?.id ?? pinnedMessage.id,
      user: "SYSTEM",
      body: consoleBody,
      time: new Date().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      messageType: "system",
    };

    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({ type: "broadcast", event: "pin_updated", payload: pinnedMessage });
    await channel.send({ type: "broadcast", event: "new_message", payload: consoleMsg });

    return { success: true, pinned: pinnedMessage, newBalance: nextTokens };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to send Super Chat." };
  }
}

/**
 * Unpins the active message from a room.
 */
export async function unpinChatMessage(
  roomId: string = "global",
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") {
    return { success: false, error: "Staff permissions required." };
  }

  const settingKey = `${PIN_SETTING_PREFIX}${roomId}`;

  try {
    await admin.from("tank_platform_settings").upsert(
      {
        key: settingKey,
        value: { active: false },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );

    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "pin_updated",
      payload: null,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to unpin message." };
  }
}
