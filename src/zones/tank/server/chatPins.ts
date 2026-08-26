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
