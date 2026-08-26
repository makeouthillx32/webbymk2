"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type UserChatHistoryEntry = {
  id: string;
  body: string;
  roomId: string;
  userRole: string;
  createdAt: string;
};

export type UserAuditProfile = {
  userId: string;
  userName: string;
  avatarUrl?: string;
  level: number;
  xp: number;
  tokens: number;
  clanName?: string;
  clanTag?: string;
  isBanned: boolean;
  bannedReason?: string;
  bannedUntil?: string;
  totalMessagesCount: number;
  roomCounts: Record<string, number>;
};

export type GetUserChatHistoryResult =
  | {
      success: true;
      profile: UserAuditProfile;
      entries: UserChatHistoryEntry[];
    }
  | { success: false; error: string };

// Staff-only (moderator or admin). Chat messages are kept indefinitely —
// tank_chat_messages has no retention/expiry job, only the deliberate
// "Purge Chat" moderator action deletes rows, and the client-side
// MAX_CHAT_DOM_MESSAGES cap in useTankRealtimeChat.ts only trims what's
// rendered, never the DB — so this is a genuine permanent record a
// moderator can pull up to inspect all messages sent across all rooms,
// ban/appeal status, and clan affiliation.
export async function getTankUserChatHistory(
  targetUserId: string,
  limit = 200,
): Promise<GetUserChatHistoryResult> {
  if (!targetUserId?.trim()) return { success: false, error: "Missing target user." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  const { data: actingProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const actingRole = actingProfile?.role || "user";
  if (actingRole !== "admin" && actingRole !== "moderator") {
    return { success: false, error: "Staff only." };
  }

  // 1. Fetch user's profile and clan info
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("id, username, display_name, avatar_url, role, xp, level, tokens, clan_id, is_banned, banned_reason, banned_until")
    .eq("id", targetUserId)
    .maybeSingle();

  // 2. Fetch clan details if member of a clan
  let clanName: string | undefined;
  let clanTag: string | undefined;
  if (targetProfile?.clan_id) {
    const { data: clan } = await admin
      .from("tank_clicks")
      .select("name, tag")
      .eq("id", targetProfile.clan_id)
      .maybeSingle();
    if (clan) {
      clanName = clan.name;
      clanTag = clan.tag;
    }
  }

  // 3. Fetch chat messages across ALL rooms (global, living-room, game-room, etc.)
  const { data: rows, error } = await admin
    .from("tank_chat_messages")
    .select("id, body, room_id, user_role, user_name, created_at")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) return { success: false, error: error.message };

  const roomCounts: Record<string, number> = {};
  const entries: UserChatHistoryEntry[] = (rows ?? []).map((r) => {
    const room = r.room_id || "global";
    roomCounts[room] = (roomCounts[room] || 0) + 1;
    return {
      id: r.id,
      body: r.body,
      roomId: room,
      userRole: r.user_role || "member",
      createdAt: r.created_at,
    };
  });

  const userName =
    targetProfile?.display_name ||
    targetProfile?.username ||
    rows?.[0]?.user_name ||
    "Unknown Chatter";

  const isBanned =
    targetProfile?.is_banned ||
    Boolean(targetProfile?.banned_until && new Date(targetProfile.banned_until) > new Date());

  const auditProfile: UserAuditProfile = {
    userId: targetUserId,
    userName,
    avatarUrl: targetProfile?.avatar_url,
    level: targetProfile?.level ?? 1,
    xp: targetProfile?.xp ?? 0,
    tokens: targetProfile?.tokens ?? 0,
    clanName,
    clanTag,
    isBanned,
    bannedReason: targetProfile?.banned_reason,
    bannedUntil: targetProfile?.banned_until,
    totalMessagesCount: entries.length,
    roomCounts,
  };

  return {
    success: true,
    profile: auditProfile,
    entries,
  };
}
