"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  getAutomodConfig,
  updateAutomodConfig,
  getBannedUsers,
  unbanUser,
  banUser,
  getUserChatAuditHistory,
  type AutomodConfig,
  type BannedUserEntry,
} from "./chatModerationDb";
import { ITEM_DEFINITIONS } from "./gamification";
import { getLevelForXp } from "../xpLevels";
import { ITEM_ACTION_DEFINITIONS } from "./chatRngEvents";

export type AdminChatDeskData = {
  automod: AutomodConfig;
  bannedUsers: BannedUserEntry[];
  recentMessages: {
    id: string;
    roomId: string;
    userId: string;
    user: string;
    body: string;
    time: string;
    role: string;
    messageType?: string;
  }[];
};

export type AdminUserRecord = {
  id: string;
  name: string;
  email?: string;
  role: "viewer" | "member" | "moderator" | "admin";
  xp: number;
  tokens: number;
  level: number;
  createdAt: string;
  inventoryCount: number;
};

export type RngLiveEvent = {
  id: string;
  userId: string;
  userName: string;
  body: string;
  time: string;
  messageType: string;
  roomId: string;
};

/**
 * Fetches real-time moderation desk data
 */
export async function getAdminChatDeskData(): Promise<AdminChatDeskData> {
  const adminSupabase = createAdminClient();
  const automod = await getAutomodConfig();
  const bannedUsers = await getBannedUsers();

  let recentMessages: AdminChatDeskData["recentMessages"] = [];
  try {
    const { data } = await adminSupabase
      .from("tank_chat_messages")
      .select("id, room_id, user_id, user_name, body, created_at, user_role, message_type")
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      recentMessages = data.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        userId: m.user_id,
        user: m.user_name,
        body: m.body,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        role: m.user_role || "member",
        messageType: m.message_type,
      }));
    }
  } catch {}

  return {
    automod,
    bannedUsers,
    recentMessages,
  };
}

/**
 * Searches and retrieves complete permanent chat history for a specific user ID or username
 */
export async function auditUserChatHistory(userIdOrName: string) {
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_chat_messages")
      .select("id, room_id, user_id, user_name, body, created_at, user_role, message_type")
      .or(`user_id.eq.${userIdOrName},user_name.ilike.%${userIdOrName}%`)
      .order("created_at", { ascending: false })
      .limit(100);

    return {
      success: true,
      logs: (data ?? []).map((m) => ({
        id: m.id,
        roomId: m.room_id,
        user: m.user_name,
        userId: m.user_id,
        body: m.body,
        time: new Date(m.created_at).toLocaleString(),
        role: m.user_role,
        messageType: m.message_type,
      })),
    };
  } catch (err) {
    return { success: false, logs: [], error: err instanceof Error ? err.message : "Failed to search logs." };
  }
}

/**
 * Saves updated Automod settings
 */
export async function saveAutomodConfigAction(config: Partial<AutomodConfig>) {
  return await updateAutomodConfig(config);
}

/**
 * Unbans a user
 */
export async function unbanUserAction(userId: string) {
  return await unbanUser(userId);
}

/**
 * Issues a ban or timeout from admin console
 */
export async function banUserFromDeskAction(params: {
  userId: string;
  userName: string;
  reason: string;
  durationMinutes: number | "permanent";
  bannedBy: string;
}) {
  return await banUser(params);
}

/**
 * Fetches user accounts with XP, tokens, level and inventory status
 */
export async function getAdminUsersList(): Promise<AdminUserRecord[]> {
  const adminSupabase = createAdminClient();

  try {
    // 1. Fetch user accounts from profiles or experience
    const { data: usersData } = await adminSupabase
      .from("profiles")
      .select("id, full_name, email, role, created_at")
      .limit(50);

    const { data: expData } = await adminSupabase
      .from("tank_user_experience")
      .select("user_id, current_xp, tokens_balance, current_level");

    const expMap = new Map<string, { xp: number; tokens: number; level: number }>();
    for (const exp of expData ?? []) {
      expMap.set(exp.user_id, {
        xp: exp.current_xp ?? 0,
        tokens: exp.tokens_balance ?? 0,
        level: exp.current_level ?? 1,
      });
    }

    // 2. Fetch inventory item counts
    const { data: invData } = await adminSupabase
      .from("tank_player_inventory")
      .select("user_id, quantity");

    const invCountMap = new Map<string, number>();
    for (const inv of invData ?? []) {
      invCountMap.set(inv.user_id, (invCountMap.get(inv.user_id) ?? 0) + (inv.quantity ?? 1));
    }

    if (usersData && usersData.length > 0) {
      return usersData.map((u) => {
        const stats = expMap.get(u.id);
        return {
          id: u.id,
          name: u.full_name || "Viewer",
          email: u.email,
          role: (u.role as AdminUserRecord["role"]) || "member",
          xp: stats?.xp ?? 0,
          tokens: stats?.tokens ?? 0,
          level: getLevelForXp(stats?.xp ?? 0),
          createdAt: new Date(u.created_at || Date.now()).toLocaleDateString(),
          inventoryCount: invCountMap.get(u.id) ?? 0,
        };
      });
    }
  } catch {}

  // Fallback defaults if profiles table is empty
  return [
    {
      id: "usr-admin-skill",
      name: "Skill",
      email: "skill@unenter.live",
      role: "admin",
      xp: 15420,
      tokens: 450,
      level: 5,
      createdAt: "8/10/2026",
      inventoryCount: 4,
    },
    {
      id: "usr-mod-owen",
      name: "Owen",
      email: "owen@unenter.live",
      role: "moderator",
      xp: 6840,
      tokens: 180,
      level: 4,
      createdAt: "8/12/2026",
      inventoryCount: 2,
    },
    {
      id: "usr-kitten",
      name: "AlienKitten",
      email: "kitten@unenter.live",
      role: "member",
      xp: 2550,
      tokens: 45,
      level: 3,
      createdAt: "8/14/2026",
      inventoryCount: 1,
    },
  ];
}

/**
 * Adjusts user token balance
 */
export async function grantUserTokensAction(userId: string, tokenDelta: number) {
  const adminSupabase = createAdminClient();

  try {
    const { data: exp } = await adminSupabase
      .from("tank_user_experience")
      .select("tokens_balance")
      .eq("user_id", userId)
      .single();

    const current = exp?.tokens_balance ?? 0;
    const next = Math.max(0, current + tokenDelta);

    await adminSupabase.from("tank_user_experience").upsert(
      {
        user_id: userId,
        tokens_balance: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return { success: true, newBalance: next };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update tokens." };
  }
}

/**
 * Updates user staff role
 */
export async function updateUserRoleAction(userId: string, newRole: string) {
  const adminSupabase = createAdminClient();

  try {
    const clearanceLevel = newRole === "admin" ? 3 : newRole === "moderator" ? 2 : 1;
    await adminSupabase
      .from("profiles")
      .update({ role: newRole, clearance_level: clearanceLevel })
      .eq("id", userId);

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to update role." };
  }
}

/**
 * Fetches recent live RNG mini-games actions and dice rolls
 */
export async function getLiveRngEvents(): Promise<RngLiveEvent[]> {
  const adminSupabase = createAdminClient();

  try {
    const { data } = await adminSupabase
      .from("tank_chat_messages")
      .select("id, room_id, user_id, user_name, body, created_at, message_type")
      .neq("message_type", "text")
      .order("created_at", { ascending: false })
      .limit(30);

    if (data) {
      return data.map((m) => ({
        id: m.id,
        roomId: m.room_id,
        userId: m.user_id,
        userName: m.user_name,
        body: m.body,
        time: new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        messageType: m.message_type || "action",
      }));
    }
  } catch {}

  return [];
}
