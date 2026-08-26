// src/zones/tank/server/chatModerationDb.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank Chat Moderation, Automod Rules, Bans & High-Traffic Filter Engine
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export type AutomodConfig = {
  enabled: boolean;
  blacklistedWords: string[];
  blockLinks: boolean;
  whitelistedDomains: string[];
  slowModeSeconds: number; // 0 = off, 3, 5, 10, 30, 60
  subOnlyMode: boolean;
  maxMessageLength: number;
};

export type BannedUserEntry = {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  bannedAt: number;
  expiresAt: number | null; // null for permanent ban
  bannedBy: string;
};

export const DEFAULT_AUTOMOD_CONFIG: AutomodConfig = {
  enabled: true,
  blacklistedWords: [
    "nigger",
    "faggot",
    "kike",
    "chink",
    "dox",
    "doxx",
    "kill yourself",
    "kys",
  ],
  blockLinks: true,
  whitelistedDomains: [
    "unenter.live",
    "tank.unenter.live",
    "youtube.com",
    "youtu.be",
    "kick.com",
    "twitch.tv",
    "twitter.com",
    "x.com",
    "discord.gg",
  ],
  slowModeSeconds: 3,
  subOnlyMode: false,
  maxMessageLength: 300,
};

const AUTOMOD_SETTING_KEY = "chat_automod_config";
const BANS_SETTING_KEY = "chat_banned_users";

/**
 * Retrieves the live Automod configuration.
 */
export async function getAutomodConfig(): Promise<AutomodConfig> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", AUTOMOD_SETTING_KEY)
      .single();

    if (data?.value) {
      return { ...DEFAULT_AUTOMOD_CONFIG, ...data.value };
    }
  } catch {}
  return DEFAULT_AUTOMOD_CONFIG;
}

/**
 * Updates the live Automod configuration.
 */
export async function updateAutomodConfig(config: Partial<AutomodConfig>): Promise<{ success: boolean }> {
  try {
    const adminSupabase = createAdminClient();
    const current = await getAutomodConfig();
    const updated = { ...current, ...config };

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: AUTOMOD_SETTING_KEY,
        value: updated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

/**
 * Retrieves all currently banned / timed-out users.
 */
export async function getBannedUsers(): Promise<BannedUserEntry[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tank_platform_settings")
      .select("value")
      .eq("key", BANS_SETTING_KEY)
      .single();

    if (data?.value && Array.isArray(data.value)) {
      const now = Date.now();
      // Filter out expired timeouts
      return data.value.filter(
        (b: BannedUserEntry) => !b.expiresAt || b.expiresAt > now
      );
    }
  } catch {}
  return [];
}

/**
 * Bans or times out a user.
 */
export async function banUser(params: {
  userId: string;
  userName: string;
  reason: string;
  durationMinutes: number | "permanent";
  bannedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const adminSupabase = createAdminClient();
    const activeBans = await getBannedUsers();

    const now = Date.now();
    const expiresAt =
      params.durationMinutes === "permanent"
        ? null
        : now + params.durationMinutes * 60 * 1000;

    const newBan: BannedUserEntry = {
      id: Math.random().toString(36).substring(2, 9),
      userId: params.userId,
      userName: params.userName,
      reason: params.reason || "Violated chat guidelines",
      bannedAt: now,
      expiresAt,
      bannedBy: params.bannedBy,
    };

    // Remove existing ban for this user and add new one
    const updatedBans = [
      ...activeBans.filter((b) => b.userId !== params.userId),
      newBan,
    ];

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: BANS_SETTING_KEY,
        value: updatedBans,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    // Broadcast user_banned event to all rooms
    const channel = adminSupabase.channel("tank:chat_moderation");
    try {
      await channel.httpSend("user_banned", { userId: params.userId, userName: params.userName });
    } finally {
      await adminSupabase.removeChannel(channel);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to ban user." };
  }
}

/**
 * Unbans a user.
 */
export async function unbanUser(userId: string): Promise<{ success: boolean }> {
  try {
    const adminSupabase = createAdminClient();
    const activeBans = await getBannedUsers();
    const updatedBans = activeBans.filter((b) => b.userId !== userId);

    await adminSupabase.from("tank_platform_settings").upsert(
      {
        key: BANS_SETTING_KEY,
        value: updatedBans,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Checks if a user is currently banned or timed out.
 */
export async function isUserBanned(userId: string): Promise<{ isBanned: boolean; reason?: string; expiresAt?: number | null }> {
  const activeBans = await getBannedUsers();
  const ban = activeBans.find((b) => b.userId === userId);
  if (!ban) return { isBanned: false };

  const now = Date.now();
  if (ban.expiresAt && ban.expiresAt <= now) {
    return { isBanned: false };
  }

  return { isBanned: true, reason: ban.reason, expiresAt: ban.expiresAt };
}

/**
 * Verifies message against Automod word blacklist, length, and unauthorized links.
 */
export function validateMessageAgainstAutomod(
  text: string,
  userRole: string,
  config: AutomodConfig
): { allowed: boolean; reason?: string; cleanedText?: string } {
  if (!config.enabled || userRole === "admin" || userRole === "moderator") {
    return { allowed: true, cleanedText: text };
  }

  if (text.length > config.maxMessageLength) {
    return { allowed: false, reason: `Message exceeds ${config.maxMessageLength} characters.` };
  }

  const lower = text.toLowerCase();

  // Check blacklisted words
  for (const word of config.blacklistedWords) {
    const cleanedWord = word.trim().toLowerCase();
    if (!cleanedWord) continue;
    if (lower.includes(cleanedWord)) {
      return { allowed: false, reason: "Message contains prohibited words." };
    }
  }

  // Check link policy
  if (config.blockLinks) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    if (matches) {
      for (const url of matches) {
        const isWhitelisted = config.whitelistedDomains.some((domain) =>
          url.toLowerCase().includes(domain.toLowerCase())
        );
        if (!isWhitelisted) {
          return { allowed: false, reason: "Unauthorized links are not permitted." };
        }
      }
    }
  }

  return { allowed: true, cleanedText: text };
}

/**
 * Soft deletes a single message (Preserves permanently in database for audit logs).
 */
export async function deleteChatMessageDb(messageId: string, roomId: string, deletedBy: string) {
  try {
    const adminSupabase = createAdminClient();
    // Do NOT delete row from DB — preserve row for ban audits and moderation review
    const { data: deleted, error } = await adminSupabase
      .from("tank_chat_messages")
      .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
      .eq("id", messageId)
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error || !deleted) return { success: false, error: error?.message || "Message unavailable." };

    // Broadcast deletion in real time to all active room viewers
    const channel = adminSupabase.channel(`room:${roomId}:chat`);
    try {
      await channel.httpSend("delete_message", { messageId, deletedBy });
    } finally {
      await adminSupabase.removeChannel(channel);
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: "Failed to delete message." };
  }
}

export async function purgeChatRoomDb(roomId: string, deletedBy: string) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("tank_chat_messages").update({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
    }).eq("room_id", roomId).is("deleted_at", null);
    if (error) return { success: false, error: error.message };
    const channel = admin.channel(`room:${roomId}:chat`);
    try {
      await channel.httpSend("purge_room", { roomId });
    } finally {
      await admin.removeChannel(channel);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Failed to clear room." };
  }
}

/**
 * Retrieves permanent audit chat history for any user (for ban inspection and reviews).
 */
export async function getUserChatAuditHistory(userId: string, limit = 500) {
  try {
    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("tank_chat_messages")
      .select("id, room_id, user_id, user_name, user_role, body, created_at, deleted_at, deleted_by")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}
