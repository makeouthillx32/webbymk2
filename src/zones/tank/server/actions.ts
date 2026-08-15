"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ChatMessage } from "../contracts";

export type SendChatMessageResult = {
  success: boolean;
  message?: ChatMessage;
  error?: string;
};

export async function sendChatMessage(
  roomId: string,
  body: string,
): Promise<SendChatMessageResult> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { success: false, error: "Message cannot be empty." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to send chat messages." };
  }

  const userName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.user_name as string) ||
    user.email?.split("@")[0] ||
    "Member";

  const userRole =
    (user.app_metadata?.role as string) === "admin"
      ? "admin"
      : (user.user_metadata?.role as string) || "member";

  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("tank_chat_messages")
      .insert({
        room_id: roomId,
        user_id: user.id,
        user_name: userName,
        user_role: userRole,
        body: trimmed,
      })
      .select("id, user_name, user_role, body, created_at")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? "Failed to save message." };
    }

    const chatMsg: ChatMessage = {
      id: data.id,
      user: data.user_name,
      body: data.body,
      time: new Date(data.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      role: (data.user_role as "viewer" | "member" | "moderator") ?? "member",
    };

    // Broadcast message over Supabase Realtime channel
    const channel = adminSupabase.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: chatMsg,
    });

    return { success: true, message: chatMsg };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to post message.",
    };
  }
}

export async function getRecentChatMessages(roomId: string): Promise<ChatMessage[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_chat_messages")
      .select("id, user_name, user_role, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      user: row.user_name,
      body: row.body,
      time: new Date(row.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      role: (row.user_role as "viewer" | "member" | "moderator") ?? "member",
    }));
  } catch {
    return [];
  }
}

export type ClanActionResult = { success: boolean; error?: string };

export async function joinClan(clanId: string): Promise<ClanActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to join a clan." };

  // Table has UNIQUE(user_id), so joining a second clan requires leaving
  // the first one — do that first so this never silently fails.
  await supabase.from("tank_clan_members").delete().eq("user_id", user.id);

  const { error } = await supabase
    .from("tank_clan_members")
    .insert({ clan_id: clanId, user_id: user.id });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function leaveClan(): Promise<ClanActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("tank_clan_members")
    .delete()
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getPlatformLaunchMode(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", "launch_mode")
      .maybeSingle();

    if (error || !data) return true; // Default to 24/7 Launch Mode enabled
    const val = data.value as { enabled?: boolean };
    return val.enabled !== false;
  } catch {
    return true;
  }
}
