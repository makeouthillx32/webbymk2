"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isConsoleMessageType, type ChatMessage, type ChatMessageType, type ChatRank } from "../contracts";
import {
  isUserBanned,
  getAutomodConfig,
  validateMessageAgainstAutomod,
} from "./chatModerationDb";
import {
  processChatRngTrigger,
  executeItemUsage,
  ITEM_ACTION_DEFINITIONS,
} from "./chatRngEvents";
import { checkChatActivityTriggers } from "./overlays";
import { setOperatorMode, getEffectiveMode } from "./directorTelemetryStore";
import type { SubjectMode } from "./directorVirtualAtlas";
import {
  getDirectorFeedPriorities,
  setDirectorFeedPriorities,
  setDirectorAttention,
  type DirectorFeedPriorities,
  DEFAULT_DIRECTOR_FEED_PRIORITIES,
} from "./directorAttentionDb";
import { requireStaff } from "./staffAuth";
import { resolveTankDisplayName } from "../identity";
import { extractImageIdsFromText } from "./chatAttachments";


import {
  getLevelForXp,
  getRankForLevel,
  processMinigameAnswer,
  sendSystemConsoleAnnouncement,
  triggerHouseTriviaRound,
  triggerCameraScavengerQuest,
  triggerHouseMultiplierEvent,
  triggerPeriodicChatEvents,
} from "./chatMinigames";

export type SendChatMessageResult = {
  success: boolean;
  message?: ChatMessage;
  error?: string;
};

export async function sendChatMessage(
  roomId: string,
  body: string,
  clientNonce?: string,
  replyToMessageId?: string,
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

  // 1. Ban check and automod config are independent reads — run them together
  // rather than one after the other. Both sit on the critical path of every
  // single message, so a serialised pair is a round trip of pure latency.
  const [banCheck, automodConfig] = await Promise.all([
    isUserBanned(user.id),
    getAutomodConfig(),
  ]);
  if (banCheck.isBanned) {
    return {
      success: false,
      error: banCheck.reason
        ? `You are banned from chat: ${banCheck.reason}`
        : "You are currently banned from sending messages.",
    };
  }

  const adminSupabase = createAdminClient();
  const [{ data: platformProfile }, { data: beforeTankProfile }] = await Promise.all([
    adminSupabase
      .from("profiles")
      .select("display_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle(),
    adminSupabase
      .from("tank_profiles")
      .select("xp, level")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  // Chat identity comes from the server-owned profile row. User-editable JWT
  // metadata is presentation input, never an authorization source.
  const userName =
    platformProfile?.display_name ||
    (user.user_metadata?.full_name as string) ||
    user.email?.split("@")[0] ||
    "Member";
  const profileRole = String(platformProfile?.role || "member").toLowerCase();
  const userRole = ["viewer", "member", "regular", "vip", "moderator", "admin"].includes(profileRole)
    ? profileRole
    : "member";

  // 2. Automod validation (word filter, unauthorized links, length limits)
  const automodResult = validateMessageAgainstAutomod(trimmed, userRole, automodConfig);
  if (!automodResult.allowed) {
    return { success: false, error: automodResult.reason || "Message blocked by Automod filter." };
  }

  try {
    const { data: rpcData, error } = await adminSupabase.rpc("tank_insert_chat_message", {
      p_user_id: user.id,
      p_room_id: roomId,
      p_user_name: userName,
      p_user_role: userRole,
      p_body: automodResult.cleanedText ?? trimmed,
      p_client_nonce: clientNonce || null,
      p_reply_to_message_id: replyToMessageId || null,
    });
    const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (error || !data) {
      return { success: false, error: error?.message ?? "Failed to save message." };
    }

    // Keep referenced attachments active and prevent premature expiry
    const attachedImageIds = extractImageIdsFromText(automodResult.cleanedText ?? trimmed);
    if (attachedImageIds.length > 0) {
      void Promise.resolve(
        adminSupabase
          .from("tank_chat_attachments")
          .update({ status: "active" })
          .in("id", attachedImageIds)
      ).catch(() => {});
    }

    const { data: afterTankProfile } = await adminSupabase
      .from("tank_profiles")
      .select("xp, level")
      .eq("user_id", user.id)
      .maybeSingle();
    const newXp = afterTankProfile?.xp ?? beforeTankProfile?.xp ?? 0;
    const newLevel = afterTankProfile?.level ?? getLevelForXp(newXp);
    const oldLevel = beforeTankProfile?.level ?? getLevelForXp(beforeTankProfile?.xp ?? 0);
    const leveledUp = newLevel > oldLevel;
    const newRank = getRankForLevel(newLevel);

    const avatarUrl =
      platformProfile?.avatar_url ||
      (user.user_metadata?.avatar_url as string) ||
      "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png";
    const nameColor = (user.user_metadata?.name_color as string) || "#ff3b2f";

    const chatMsg: ChatMessage = {
      id: data.id,
      userId: data.user_id || user.id,
      user: data.user_name,
      body: data.body,
      time: new Date(data.created_at).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      role: (data.user_role as "viewer" | "member" | "regular" | "vip" | "moderator" | "admin") ?? "member",
      avatarUrl,
      nameColor,
      level: newLevel,
      xp: newXp,
      rank: newRank,
      messageType: "text",
      ...(data.client_nonce ? { clientNonce: data.client_nonce } : {}),
      ...(data.reply_to_message_id ? { replyToMessageId: data.reply_to_message_id } : {}),
      ...(data.reply_to_user_id ? { replyToUserId: data.reply_to_user_id } : {}),
    };

    const isClickChat = roomId.startsWith("click:");

    // Public room chat uses Broadcast for speed. Click chat deliberately does
    // not: its realtime path is RLS-filtered Postgres Changes, so knowing a
    // Click UUID never grants access to its messages.
    if (!isClickChat) {
      const channel = adminSupabase.channel(`room:${roomId}:chat`);
      try {
        await channel.httpSend("new_message", chatMsg);
      } finally {
        await adminSupabase.removeChannel(channel);
      }
    }

    // 4. Trigger level up announcement if user leveled up
    if (leveledUp && !isClickChat) {
      try {
        void sendSystemConsoleAnnouncement(
          roomId,
          `🎉 [LEVEL UP] @${userName} reached Level ${newLevel}! Rank Unlocked: ${newRank}!`,
          "level_up",
        );
      } catch {}
    }

    // 5. Check if message answers an active Chat Minigame (Trivia / Camera Scavenger)
    if (!isClickChat) {
      try {
        void processMinigameAnswer(user.id, userName, roomId, trimmed);
      } catch {}
    }

    // 6. Manual Staff / Command Minigame Triggers (!trivia, !quest, /trivia, /quest)
    const lowerText = trimmed.toLowerCase();
    if (!isClickChat && (lowerText === "!trivia" || lowerText === "/trivia")) {
      try {
        void triggerHouseTriviaRound(roomId);
      } catch {}
    } else if (!isClickChat && (lowerText === "!quest" || lowerText === "/quest")) {
      try {
        void triggerCameraScavengerQuest(roomId);
      } catch {}
    } else if (!isClickChat && (lowerText === "!multiplier" || lowerText === "/multiplier")) {
      try {
        void triggerHouseMultiplierEvent(2, 15, roomId);
      } catch {}
    }

    // Automated Mission Progress Tracking
    void recordTankMissionProgress("post_first_message", 1, user.id);

    // Track "Press T for Tank (20x)" mission
    const tCount = (trimmed.match(/t/gi) || []).length;
    if (tCount > 0) {
      void recordTankMissionProgress("type_t_20_times", tCount, user.id);
    }

    // Track minigame/luck mission
    if (trimmed.startsWith("/roll") || trimmed.startsWith("/flip") || trimmed.startsWith("/slots") || trimmed.startsWith("/unbox") || trimmed.startsWith("/roulette")) {
      void recordTankMissionProgress("roll_luck_game", 1, user.id);
    }

    // Check for In-game RNG / Action triggers (/me, /use, /fart, /roll, auto RNG drops)
    if (!isClickChat) {
      try {
        void processChatRngTrigger(user.id, userName, roomId, trimmed);
      } catch {}
    }

    // Check for periodic Discord console message broadcast
    if (!isClickChat) {
      try {
        void checkAndTriggerDiscordAnnouncement(roomId);
      } catch {}
    }

    // Activity-driven overlay triggers
    if (!isClickChat) {
      try {
        void checkChatActivityTriggers(roomId, trimmed);
      } catch {}
    }

    // Periodic Chat Events Cron Helper (e.g. Trivia every 15 mins)
    if (!isClickChat) {
      try {
        void triggerPeriodicChatEvents(roomId);
      } catch {}
    }

    return { success: true, message: chatMsg };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to post message.",
    };
  }
}

let globalMessageCounter = 0;
const DISCORD_ANNOUNCE_INTERVAL = 25; // Trigger every 25 messages in global chat

export async function checkAndTriggerDiscordAnnouncement(roomId: string) {
  if (roomId !== "director" && roomId !== "global") return;
  globalMessageCounter += 1;

  if (globalMessageCounter % DISCORD_ANNOUNCE_INTERVAL === 0) {
    const adminSupabase = createAdminClient();
    const discordMsg: ChatMessage = {
      id: `sys_discord_${Date.now()}`,
      user: "SYSTEM",
      body: "📢 Join the official Discord: https://discord.gg/b9bddXeD3M — yell at me if you want to see more things or have feedback!",
      time: new Date().toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      messageType: "system",
    };

    try {
      await adminSupabase.from("tank_chat_messages").insert({
        room_id: roomId,
        user_id: null,
        user_name: "SYSTEM",
        user_role: "system",
        body: discordMsg.body,
        message_type: "system",
      });

      const channel = adminSupabase.channel(`room:${roomId}:chat`);
      await channel.send({
        type: "broadcast",
        event: "new_message",
        payload: discordMsg,
      });
    } catch {}
  }
}

// Staff-triggered chat announcement. Posts as "SYSTEM" — never as a named bot
// or user account. Tank chat renders this centered with no user attached.
export async function broadcastConsoleMessage(
  roomId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { success: false, error: "Message cannot be empty." };
  if (!roomId?.trim()) return { success: false, error: "Missing target room." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role || "user";
  if (role !== "admin" && role !== "moderator") {
    return { success: false, error: "Staff only." };
  }

  // No sender. The staff member's account authorizes the trigger, it does not
  // author the line — the console speaks as the house, not as a user.
  try {
    const { data: msgData, error } = await admin
      .from("tank_chat_messages")
      .insert({
        room_id: roomId,
        user_id: null,
        user_name: "SYSTEM",
        user_role: "system",
        body: trimmed,
        message_type: "system",
      })
      .select("id, created_at")
      .single();
    if (error || !msgData) {
      return { success: false, error: error?.message ?? "Failed to persist console message." };
    }

    const consoleMsg: ChatMessage = {
      id: msgData.id,
      user: "SYSTEM",
      body: trimmed,
      time: new Date(msgData.created_at).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      }),
      messageType: "system",
    };

    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: consoleMsg,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to broadcast." };
  }
}

export async function useTankItem(
  itemSlug: string,
  roomId = "director",
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to use items." };

  const def = ITEM_ACTION_DEFINITIONS[itemSlug];
  if (!def) return { success: false, error: "Unknown inventory item." };

  const userName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.user_name as string) ||
    user.email?.split("@")[0] ||
    "Member";

  // 1. Try Postgres RPC Function tank_use_inventory_item in db.unenter.live
  try {
    const admin = createAdminClient();
    const { data: rpcResult, error: rpcErr } = await admin.rpc("tank_use_inventory_item", {
      p_user_id: user.id,
      p_item_slug: itemSlug,
      p_room_id: roomId,
    });

    if (!rpcErr && rpcResult?.success) {
      const message: ChatMessage = {
        id: rpcResult.message_id || `item_${Date.now()}`,
        userId: user.id,
        user: userName,
        body: `${userName} ${def.actionText}`,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        messageType: "item_use",
        itemSlug: def.slug,
        itemName: def.name,
        itemIconUrl: def.iconUrl,
        itemRarity: def.rarity,
      };

      // tank_chat_messages is not in any realtime publication, so the RPC's
      // INSERT reaches nobody on its own — every other viewer would only see
      // this item fire after a reload. The room's broadcast channel is what
      // the chat client actually listens on, so push it there explicitly.
      try {
        const channel = admin.channel(`room:${roomId}:chat`);
        await channel.send({ type: "broadcast", event: "new_message", payload: message });
      } catch {}

      void recordTankMissionProgress("use_first_item", 1, user.id);

      return { success: true, message };
    }
  } catch {}

  // 2. High-availability fallback to application-level execution
  const msg = await executeItemUsage(user.id, userName, roomId, def);
  if (msg) {
    void recordTankMissionProgress("use_first_item", 1, user.id);
  }
  return { success: !!msg, message: msg ?? undefined };
}

export async function getRecentChatMessages(roomId: string): Promise<ChatMessage[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_chat_messages")
      .select("id, user_id, user_name, user_role, body, created_at, message_type, item_slug, metadata, client_nonce, reply_to_message_id, reply_to_user_id")
      .eq("room_id", roomId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error || !data) return [];
    data.reverse();

    const messageIds = data.map((row) => row.id);
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { data: reactionRows } = messageIds.length
      ? await supabase
          .from("tank_chat_reactions")
          .select("message_id, user_id, reaction")
          .in("message_id", messageIds)
      : { data: [] };
    const reactionMap = new Map<string, ChatMessage["reactions"]>();
    for (const reaction of reactionRows ?? []) {
      const existing = reactionMap.get(reaction.message_id) ?? [];
      const found = existing.find((entry) => entry.reaction === reaction.reaction);
      if (found) {
        found.count += 1;
        found.reactedByMe ||= reaction.user_id === currentUser?.id;
      } else {
        existing.push({
          reaction: reaction.reaction as NonNullable<ChatMessage["reactions"]>[number]["reaction"],
          count: 1,
          reactedByMe: reaction.user_id === currentUser?.id,
        });
      }
      reactionMap.set(reaction.message_id, existing);
    }
    const replyMap = new Map(data.map((row) => [row.id, row]));

    // Collect distinct user IDs to fetch profile XP/Level/Rank
    const userIds = Array.from(new Set(data.map((r) => r.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, { xp: number; level: number; rank: ChatRank; avatarUrl?: string }>();

    if (userIds.length > 0) {
      try {
        const [{ data: profiles }, { data: coreProfiles }] = await Promise.all([
          supabase
            .from("tank_profiles")
            .select("user_id, xp, level")
            .in("user_id", userIds),
          supabase
            .from("profiles")
            .select("id, avatar_url")
            .in("id", userIds),
        ]);

        const avatarByUserId = new Map(
          (coreProfiles ?? []).map((profile) => [profile.id, profile.avatar_url || undefined]),
        );

        for (const userId of userIds) {
          const level = 1;
          profileMap.set(userId, {
            xp: 0,
            level,
            rank: getRankForLevel(level),
            avatarUrl: avatarByUserId.get(userId),
          });
        }

        for (const p of profiles ?? []) {
          const xp = p.xp ?? 0;
          const level = p.level ?? getLevelForXp(xp);
          const rank = getRankForLevel(level);
          profileMap.set(p.user_id, {
            xp,
            level,
            rank,
            avatarUrl: avatarByUserId.get(p.user_id),
          });
        }
      } catch {}
    }

    return data.map((row) => {
      // The persisted message_type is authoritative — it's written at the
      // moment the event fires (tank_use_inventory_item, saveAndBroadcast,
      // broadcastConsoleMessage). Sniffing the body for "[SYSTEM]" markers is
      // only a fallback for legacy rows written before the column existed.
      const persistedType = (row.message_type ?? null) as ChatMessageType | "chat" | null;
      const hasNoSender =
        !row.user_id ||
        row.user_name === "CONSOLE" ||
        row.user_name === "SYSTEM" ||
        row.user_name === "HOUSE EVENT";

      let msgType: ChatMessageType;
      if (persistedType && persistedType !== "chat") {
        msgType = persistedType;
      } else if (row.body.includes("[HOUSE EVENT]") || row.body.includes("TRIVIA") || row.body.includes("SCAVENGER")) {
        msgType = "house_event";
      } else if (row.body.includes("[LEVEL UP]")) {
        msgType = "level_up";
      } else if (hasNoSender || row.body.includes("[SYSTEM]")) {
        msgType = "system";
      } else {
        msgType = "text";
      }

      const time = new Date(row.created_at).toLocaleString([], {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
      });

      // A console line carries NO sender identity. Not a role badge, not an
      // avatar, not a level/rank/clan tag — the house triggered it, no account
      // did. The only name that may appear is the one already baked into the
      // body text. See CONSOLE_MESSAGE_TYPES in contracts.ts.
      if (isConsoleMessageType(msgType)) {
        const itemDef = row.item_slug ? ITEM_ACTION_DEFINITIONS[row.item_slug] : undefined;
        const metadata = (row.metadata ?? {}) as Partial<ChatMessage>;

        return {
          // userId is retained so moderation (delete-message, ban-purge) can
          // still attribute the event, but nothing about the sender renders.
          userId: row.user_id || undefined,
          user: row.user_name,
          ...metadata,
          id: row.id,
          body: row.body,
          time,
          createdAt: row.created_at,
          messageType: msgType,
          itemSlug: row.item_slug || undefined,
          itemName: itemDef?.name,
          itemIconUrl: itemDef?.iconUrl,
          itemRarity: itemDef?.rarity,
          clientNonce: row.client_nonce || undefined,
          replyToMessageId: row.reply_to_message_id || undefined,
          replyToUserId: row.reply_to_user_id || undefined,
          replyToUserName: row.reply_to_message_id ? replyMap.get(row.reply_to_message_id)?.user_name : undefined,
          replyPreview: row.reply_to_message_id ? replyMap.get(row.reply_to_message_id)?.body.slice(0, 100) : undefined,
          reactions: reactionMap.get(row.id) ?? [],
        } satisfies ChatMessage;
      }

      const profile = row.user_id ? profileMap.get(row.user_id) : undefined;
      const level = profile?.level ?? 1;
      const xp = profile?.xp ?? 0;
      const rank: ChatRank = profile?.rank ?? getRankForLevel(level);

      return {
        id: row.id,
        userId: row.user_id || undefined,
        user: row.user_name,
        body: row.body,
        time,
        createdAt: row.created_at,
        role: (row.user_role as ChatMessage["role"]) ?? "member",
        avatarUrl:
          profile?.avatarUrl ||
          "https://db.unenter.live/storage/v1/object/public/tank-avatars/default.png",
        level,
        xp,
        rank,
        messageType: msgType,
        clientNonce: row.client_nonce || undefined,
        replyToMessageId: row.reply_to_message_id || undefined,
        replyToUserId: row.reply_to_user_id || undefined,
        replyToUserName: row.reply_to_message_id ? replyMap.get(row.reply_to_message_id)?.user_name : undefined,
        replyPreview: row.reply_to_message_id ? replyMap.get(row.reply_to_message_id)?.body.slice(0, 100) : undefined,
        reactions: reactionMap.get(row.id) ?? [],
      } satisfies ChatMessage;
    });
  } catch {
    return [];
  }
}

/**
 * Automated Cron/Timer Helper: Schedule periodic chat events (e.g. Trivia every 15 mins, House Multipliers)
 */
export async function schedulePeriodicChatEvents(roomId = "global") {
  return await triggerPeriodicChatEvents(roomId);
}

export type ClanActionResult = { success: boolean; error?: string };

export async function joinClan(clanId: string): Promise<ClanActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in to join a Click." };

  // Table has UNIQUE(user_id), so joining a second clan requires leaving
  // the first one — do that first so this never silently fails.
  const admin = createAdminClient();
  await admin.from("tank_click_members").delete().eq("user_id", user.id);

  const { error } = await admin
    .from("tank_click_members")
    .insert({ click_id: clanId, user_id: user.id });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function leaveClan(): Promise<ClanActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const { error } = await supabase
    .from("tank_click_members")
    .delete()
    .eq("user_id", user.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export type AudioMode = "native" | "external" | "muted";

export type SetCameraAudioConfigResult = { success: boolean; error?: string };

// Deliberate stub: the real write moved to the scoped Tank admin audio API
// (/api/tank/admin/cameras/audio, backed by cameraRegistryDb#saveCameraAudioAssignment)
// so room, shared-audio, and native-replacement rules are enforced in one
// place. This action exists only to redirect any caller still wired to it.
export async function setCameraAudioConfig(
  _cameraId: string,
  _config: {
    audioMode: AudioMode;
    audioSourceId?: string | null;
    audioSourceName?: string | null;
    hasNativeAudio?: boolean;
  },
): Promise<SetCameraAudioConfigResult> {
  return {
    success: false,
    error:
      "Use the scoped Tank admin audio API so room, shared-audio, and native replacement rules are enforced.",
  };
}

export type CompleteMissionResult = {
  success: boolean;
  alreadyCompleted?: boolean;
  rewardTokens?: number;
  rewardXp?: number;
  error?: string;
};

// Real mission completion — writes to tank_mission_progress and awards
// tokens/XP via the tank_complete_mission() DB function (idempotent,
// race-safe: see supabase/migrations/*_tank_mission_completion.sql). Before
// this, tank_missions/tank_mission_progress were real, read-only bones with
// nothing anywhere that ever wrote a completion — the UI showed live
export async function recordTankMissionProgress(
  missionKey: string,
  increment: number = 1,
  userId?: string,
): Promise<{ success: boolean; completed?: boolean; justCompleted?: boolean }> {
  try {
    let targetUserId = userId;
    if (!targetUserId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      targetUserId = user?.id;
    }
    if (!targetUserId) return { success: false };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("tank_record_mission_progress", {
      p_user_id: targetUserId,
      p_mission_key: missionKey,
      p_increment: increment,
    });
    if (error) return { success: false };
    return data as { success: boolean; completed?: boolean; justCompleted?: boolean };
  } catch {
    return { success: false };
  }
}

// missions that could never actually be checked off.
export async function completeMission(missionTitle: string): Promise<CompleteMissionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("tank_complete_mission", {
      p_user_id: user.id,
      p_mission_title: missionTitle,
    });
    if (error) return { success: false, error: error.message };
    return (data ?? { success: false, error: "No response from mission completion." }) as CompleteMissionResult;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to complete mission.",
    };
  }
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

/**
 * Ensures any user logging in from Tank gets tagged with 'tank' & 'unenter_auth'
 * in user_metadata, initializes their tank_profiles row, and awards the first-time sign-in mission.
 */
export async function recordTankAuthSignIn(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "No authenticated session found." };

  try {
    const admin = createAdminClient();

    // 1. Detect Authentication Provider & Verification Method
    const rawProvider =
      (user.app_metadata?.provider as string) ||
      (user.app_metadata?.providers?.[0] as string) ||
      (user.identities?.[0]?.provider as string) ||
      "email";

    const isOAuth = rawProvider === "google" || rawProvider === "facebook";
    const isEmailConfirmed = Boolean(user.email_confirmed_at || user.confirmed_at);
    const emailVerified = isOAuth || isEmailConfirmed;

    const verifiedVia = isOAuth
      ? `${rawProvider}_oauth`
      : isEmailConfirmed
      ? "email_link"
      : "unverified";

    // 2. Prepare the Tank tags and auth metadata. The single metadata write
    // happens after resolving the canonical Tank display name below.
    const currentTags: string[] = Array.isArray(user.user_metadata?.tags)
      ? user.user_metadata.tags
      : [];

    const updatedTags = Array.from(new Set([...currentTags, "tank", "unenter_auth"]));
    // 3. Preserve the application-owned Tank identity. Provider metadata is
    // only a first-sign-in fallback and must never overwrite a chosen name.
    const [{ data: existingTankProfile }, { data: existingCoreProfile }] = await Promise.all([
      admin.from("tank_profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    const displayName = resolveTankDisplayName({
      tankDisplayName: existingTankProfile?.display_name,
      coreDisplayName: existingCoreProfile?.display_name,
      authDisplayName: user.user_metadata?.display_name,
      providerFullName: user.user_metadata?.full_name,
      providerUserName: user.user_metadata?.user_name,
      email: user.email,
    });

    // Make browser presentation converge on the chosen Tank name without
    // changing the provider's own full_name field.
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        display_name: displayName,
        tags: updatedTags,
        auth_provider: rawProvider,
        verified_via: verifiedVia,
        email_verified: emailVerified,
        last_tank_sign_in: new Date().toISOString(),
      },
    });

    await Promise.all([
      admin.from("tank_profiles").upsert(
        {
          user_id: user.id,
          display_name: displayName,
          auth_provider: rawProvider,
          verified_via: verifiedVia,
          email_verified: emailVerified,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      ),
      admin.from("profiles").upsert(
        {
          id: user.id,
          auth_user_id: user.id,
          email: user.email || null,
          display_name: displayName,
          auth_provider: rawProvider,
          verified_via: verifiedVia,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      ),
    ]);

    // 4. Mark the first-time mission as complete
    void completeMission("Sign in for the first time");

    return { success: true };
  } catch (err) {
    console.error("[TankAuth] ❌ Failed to record Tank sign-in tag:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record Tank sign-in.",
    };
  }
}

export type UpdateTankProfilePayload = {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  nameColor?: string;
};

export type UpdateTankProfileResult = {
  success: boolean;
  error?: string;
  displayName?: string;
  renameKind?: "setup" | "unchanged" | "free_rename" | "ticket_rename";
  profileSetupComplete?: boolean;
  freeRenameAvailable?: boolean;
  renameTicketQuantity?: number;
};

export async function updateTankProfile(
  payload: UpdateTankProfilePayload
): Promise<UpdateTankProfileResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to update your profile." };
  }

  try {
    const admin = createAdminClient();

    let identityResult:
      | {
          display_name: string;
          change_kind: "setup" | "unchanged" | "free_rename" | "ticket_rename";
          setup_complete: boolean;
          free_rename_available: boolean;
          rename_ticket_quantity: number;
        }
      | undefined;

    if (payload.displayName !== undefined) {
      const { data, error } = await admin.rpc("tank_set_display_name", {
        p_user_id: user.id,
        p_display_name: payload.displayName,
      });
      if (error) {
        if (error.code === "23505") {
          return { success: false, error: "That Tank name is already taken." };
        }
        throw error;
      }
      identityResult = (Array.isArray(data) ? data[0] : data) as typeof identityResult;
    }

    const canonicalDisplayName = identityResult?.display_name;

    // 1. Update auth.users metadata
    const updatedMetadata = {
      ...user.user_metadata,
      ...(canonicalDisplayName
        ? { display_name: canonicalDisplayName, full_name: canonicalDisplayName }
        : {}),
      ...(payload.avatarUrl !== undefined ? { avatar_url: payload.avatarUrl } : {}),
      ...(payload.bio !== undefined ? { bio: payload.bio.slice(0, 500) } : {}),
      ...(payload.nameColor !== undefined ? { name_color: payload.nameColor } : {}),
    };

    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    });
    if (authError) throw authError;

    // 2. Keep shared identity in the core profile and Tank progression in the
    // narrow tank_profiles schema. Avatar/bio/color are intentionally not
    // written to tank_profiles because those columns do not exist.
    const coreProfileUpdates: Record<string, unknown> = {
      id: user.id,
      auth_user_id: user.id,
      email: user.email || null,
      updated_at: new Date().toISOString(),
    };
    if (canonicalDisplayName) coreProfileUpdates.display_name = canonicalDisplayName;
    if (payload.avatarUrl !== undefined) coreProfileUpdates.avatar_url = payload.avatarUrl;

    const tankProfileUpdates: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (canonicalDisplayName) tankProfileUpdates.display_name = canonicalDisplayName;

    const [{ error: coreProfileError }, { error: tankProfileError }] = await Promise.all([
      admin.from("profiles").upsert(coreProfileUpdates, { onConflict: "id" }),
      admin.from("tank_profiles").upsert(tankProfileUpdates, { onConflict: "user_id" }),
    ]);
    if (coreProfileError) throw coreProfileError;
    if (tankProfileError) throw tankProfileError;

    return {
      success: true,
      displayName: canonicalDisplayName,
      renameKind: identityResult?.change_kind,
      profileSetupComplete: identityResult?.setup_complete,
      freeRenameAvailable: identityResult?.free_rename_available,
      renameTicketQuantity: identityResult?.rename_ticket_quantity,
    };
  } catch (err) {
    console.error("[TankProfile] ❌ Failed to update profile:", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? String(err.message)
        : err instanceof Error
          ? err.message
          : "Failed to update profile.";
    return {
      success: false,
      error: message,
    };
  }
}

export async function saveTankUserSettings(
  settings: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "You must be signed in to save settings." };
  }

  try {
    const admin = createAdminClient();

    // 1. Persist to auth user_metadata for cross-device instant sync
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        tank_settings: settings,
      },
    });

    // 2. Persist to tank_profiles table
    await admin
      .from("tank_profiles")
      .upsert(
        {
          user_id: user.id,
          settings: settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    return { success: true };
  } catch (err) {
    console.error("[TankSettings] ❌ Failed to save user settings:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save settings.",
    };
  }
}

/**
 * spinTankPrizeMachine
 * 
 * Deducts 100 tokens from tank_profiles, spins the prize wheel, and writes
 * any won items/tokens/XP directly to tank_player_inventory and tank_profiles.
 */
export async function spinTankPrizeMachine(): Promise<{
  success: boolean;
  prize?: string;
  rewardType?: "item" | "tokens" | "xp";
  newTokens?: number;
  newXp?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to spin the prize machine." };

  const admin = createAdminClient();

  // 1. Fetch current tank_profiles tokens
  const { data: profile } = await admin
    .from("tank_profiles")
    .select("tokens, xp, level, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentTokens = profile?.tokens || 0;
  const SPIN_COST = 100;
  if (currentTokens < SPIN_COST) {
    return { success: false, error: `Not enough tokens! You have ${currentTokens} $UNT (Need ${SPIN_COST}).` };
  }

  // 2. Deduct cost
  const tokensAfterCost = currentTokens - SPIN_COST;
  await admin
    .from("tank_profiles")
    .update({ tokens: tokensAfterCost, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  await admin.from("tank_token_transactions").insert({
    user_id: user.id,
    amount: -SPIN_COST,
    reason: "Prize Machine Spin",
  });

  // 3. Roll Prize
  const possibleRewards = [
    { type: "tokens" as const, amount: 250, label: "+250 Tokens (Jackpot!)" },
    { type: "tokens" as const, amount: 150, label: "+150 Tokens" },
    { type: "xp" as const, amount: 100, label: "+100 XP" },
    { type: "item" as const, slug: "royal-jelly", label: "Royal Jelly (Legendary)" },
    { type: "item" as const, slug: "fucked-up-shit", label: "Mystery Concoction (Epic)" },
    { type: "item" as const, slug: "crisp-shorts", label: "Crisp Shorts (Uncommon)" },
    { type: "item" as const, slug: "boxing-gloves", label: "Boxing Gloves (Uncommon)" },
    { type: "item" as const, slug: "battery", label: "Batteries (Common)" },
  ];

  const won = possibleRewards[Math.floor(Math.random() * possibleRewards.length)];
  let finalTokens = tokensAfterCost;
  let finalXp = profile?.xp || 0;

  if (won.type === "tokens") {
    finalTokens += won.amount;
    await admin
      .from("tank_profiles")
      .update({ tokens: finalTokens, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);

    await admin.from("tank_token_transactions").insert({
      user_id: user.id,
      amount: won.amount,
      reason: "Prize Machine Win",
    });
  } else if (won.type === "xp") {
    finalXp += won.amount;
    const newLevel = Math.floor(Math.sqrt(finalXp / 10)) + 1;
    await admin
      .from("tank_profiles")
      .update({ xp: finalXp, level: newLevel, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
  } else if (won.type === "item") {
    // Find item ID
    const { data: dbItem } = await admin
      .from("tank_inventory_items")
      .select("id")
      .eq("slug", won.slug)
      .maybeSingle();

    if (dbItem) {
      const { data: existingSlot } = await admin
        .from("tank_player_inventory")
        .select("quantity")
        .eq("user_id", user.id)
        .eq("item_id", dbItem.id)
        .maybeSingle();

      const newQty = (existingSlot?.quantity || 0) + 1;
      await admin.from("tank_player_inventory").upsert(
        {
          user_id: user.id,
          item_id: dbItem.id,
          quantity: newQty,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,item_id" }
      );
    }
  }

  // 4. Dispatch System Notice to Chat
  const userName = profile?.display_name || user.email?.split("@")[0] || "Viewer";
  const consoleNotice = `[SYSTEM CONSOLE] 🎰 ${userName} spun the Prize Machine and won ${won.label}!`;

  try {
    await admin.from("tank_chat_messages").insert({
      room_id: "director",
      user_id: null,
      user_name: "SYSTEM",
      user_role: "system",
      body: consoleNotice,
      message_type: "system",
    });

    const channel = admin.channel("room:director:chat");
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: {
        id: `sys_prize_${Date.now()}`,
        user: "SYSTEM",
        body: consoleNotice,
        time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        messageType: "system",
      },
    });
  } catch {}

  return {
    success: true,
    prize: won.label,
    rewardType: won.type,
    newTokens: finalTokens,
    newXp: finalXp,
  };
}

/**
 * craftTankFusion
 * 
 * Combines 2 items from tank_player_inventory, consumes them, and grants a fused
 * item + crafting XP directly in tank_player_inventory and tank_profiles.
 */
export async function craftTankFusion(
  slot1Id: string,
  slot2Id: string
): Promise<{ success: boolean; craftedName?: string; craftedIcon?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to craft items." };

  const admin = createAdminClient();

  // 1. Fetch user inventory slots
  const { data: invRows } = await admin
    .from("tank_player_inventory")
    .select("item_id, quantity, tank_inventory_items(slug, name, rarity)")
    .eq("user_id", user.id)
    .in("item_id", [slot1Id, slot2Id]);

  if (!invRows || invRows.length < (slot1Id === slot2Id ? 1 : 2)) {
    return { success: false, error: "You do not own the required items to craft." };
  }

  const slot1 = invRows.find((r) => r.item_id === slot1Id);
  const slot2 = invRows.find((r) => r.item_id === slot2Id);

  if (!slot1 || slot1.quantity < 1 || !slot2 || (slot1Id === slot2Id && slot1.quantity < 2)) {
    return { success: false, error: "Insufficient item quantities for crafting." };
  }

  // 2. Consume ingredients
  if (slot1Id === slot2Id) {
    if (slot1.quantity === 2) {
      await admin.from("tank_player_inventory").delete().eq("user_id", user.id).eq("item_id", slot1Id);
    } else {
      await admin.from("tank_player_inventory").update({ quantity: slot1.quantity - 2 }).eq("user_id", user.id).eq("item_id", slot1Id);
    }
  } else {
    for (const s of [slot1, slot2]) {
      if (s.quantity === 1) {
        await admin.from("tank_player_inventory").delete().eq("user_id", user.id).eq("item_id", s.item_id);
      } else {
        await admin.from("tank_player_inventory").update({ quantity: s.quantity - 1 }).eq("user_id", user.id).eq("item_id", s.item_id);
      }
    }
  }

  // 3. Select crafted outcome (e.g. Royal Jelly or Mystery Concoction or Lightsaber)
  const fusionTargets = ["royal-jelly", "fucked-up-shit", "lightsaber", "launch-keys"];
  const chosenSlug = fusionTargets[Math.floor(Math.random() * fusionTargets.length)];

  const { data: craftedItem } = await admin
    .from("tank_inventory_items")
    .select("id, name, icon_url")
    .eq("slug", chosenSlug)
    .maybeSingle();

  if (craftedItem) {
    const { data: exist } = await admin
      .from("tank_player_inventory")
      .select("quantity")
      .eq("user_id", user.id)
      .eq("item_id", craftedItem.id)
      .maybeSingle();

    await admin.from("tank_player_inventory").upsert(
      {
        user_id: user.id,
        item_id: craftedItem.id,
        quantity: (exist?.quantity || 0) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,item_id" }
    );
  }

  // 4. Award +35 Crafting XP to tank_profiles
  const { data: profile } = await admin
    .from("tank_profiles")
    .select("xp")
    .eq("user_id", user.id)
    .maybeSingle();

  const newXp = (profile?.xp || 0) + 35;
  const newLevel = Math.floor(Math.sqrt(newXp / 10)) + 1;
  await admin
    .from("tank_profiles")
    .update({ xp: newXp, level: newLevel, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  return {
    success: true,
    craftedName: craftedItem?.name || "Synthesized Artifact",
    craftedIcon: craftedItem?.icon_url || undefined,
  };
}


export async function setDirectorModeAction(mode: SubjectMode): Promise<{ success: boolean; mode: SubjectMode; error?: string }> {
  try {
    setOperatorMode(mode);
    return { success: true, mode };
  } catch (err: any) {
    return { success: false, mode: "auto", error: err?.message || "Failed to set director mode" };
  }
}

export async function getDirectorModeAction(): Promise<{ success: boolean; mode: SubjectMode }> {
  return { success: true, mode: getEffectiveMode() };
}

export async function getDirectorPrioritiesAction(): Promise<{
  success: boolean;
  priorities: DirectorFeedPriorities;
  error?: string;
}> {
  try {
    const priorities = await getDirectorFeedPriorities();
    return { success: true, priorities };
  } catch (err: any) {
    return {
      success: false,
      priorities: DEFAULT_DIRECTOR_FEED_PRIORITIES,
      error: err?.message || "Failed to fetch director priorities",
    };
  }
}

export async function setDirectorPrioritiesAction(
  updates: Partial<DirectorFeedPriorities>
): Promise<{ success: boolean; priorities: DirectorFeedPriorities; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("tank_profiles")
      .select("role, username")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    const role = profile?.role;
    if (role !== "admin" && role !== "moderator") {
      return {
        success: false,
        priorities: DEFAULT_DIRECTOR_FEED_PRIORITIES,
        error: "Unauthorized: Moderator or Admin role required.",
      };
    }

    const res = await setDirectorFeedPriorities(updates, profile?.username || "Operator");
    return res;
  } catch (err: any) {
    return {
      success: false,
      priorities: DEFAULT_DIRECTOR_FEED_PRIORITIES,
      error: err?.message || "Failed to set director priorities",
    };
  }
}

export async function takeDirectorLiveAction(params: {
  targetType: "camera" | "room" | "irl";
  targetId: string;
  targetLabel: string;
  durationMinutes?: number | "indefinite";
}): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("tank_profiles")
      .select("role, username")
      .eq("user_id", user?.id ?? "")
      .maybeSingle();

    const role = profile?.role;
    if (role !== "admin" && role !== "moderator") {
      return { success: false, error: "Unauthorized: Moderator or Admin role required." };
    }

    const res = await setDirectorAttention({
      targetType: params.targetType,
      targetId: params.targetId,
      targetLabel: params.targetLabel,
      durationMinutes: params.durationMinutes ?? 15,
      operatorName: profile?.username || "Operator",
      multiCameraMode: "audio_peak",
    });

    return { success: res.success, error: res.error };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to take director live" };
  }
}

export type HouseRoomData = {
  id: string;
  slug: string;
  title: string;
  eyebrow: string | null;
  description: string | null;
  live: boolean;
  viewers: number;
  camera_ids: string[];
  audio_output_kind: string;
  audio_output_config: {
    volume?: number;
    muted?: boolean;
    [key: string]: any;
  };
};

export async function listHouseRoomsAction(): Promise<{ success: boolean; rooms: HouseRoomData[]; error?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_rooms")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      return { success: false, rooms: [], error: error.message };
    }
    return { success: true, rooms: (data as HouseRoomData[]) || [] };
  } catch (err: any) {
    return { success: false, rooms: [], error: err?.message || "Failed to fetch house rooms" };
  }
}

export async function updateHouseRoomAction(
  roomId: string,
  updates: {
    title?: string;
    eyebrow?: string;
    description?: string;
    volume?: number;
    muted?: boolean;
    live?: boolean;
    audioOutputKind?: "embedded" | "client-broadcast" | "host-bluetooth";
  }
): Promise<{ success: boolean; room?: HouseRoomData; error?: string }> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Staff access required." };
    const admin = createAdminClient();
    
    const { data: current } = await admin
      .from("tank_rooms")
      .select("*")
      .eq("id", roomId)
      .maybeSingle();

    const currentConfig = (current?.audio_output_config as Record<string, any>) || {};
    const nextConfig = {
      ...currentConfig,
      ...(updates.volume !== undefined ? { volume: updates.volume } : {}),
      ...(updates.muted !== undefined ? { muted: updates.muted } : {}),
    };

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
      audio_output_config: nextConfig,
    };

    if (updates.title !== undefined) updatePayload.title = updates.title;
    if (updates.eyebrow !== undefined) updatePayload.eyebrow = updates.eyebrow;
    if (updates.description !== undefined) updatePayload.description = updates.description;
    if (updates.live !== undefined) updatePayload.live = updates.live;
    if (updates.audioOutputKind !== undefined) updatePayload.audio_output_kind = updates.audioOutputKind;

    const { data, error } = await admin
      .from("tank_rooms")
      .update(updatePayload)
      .eq("id", roomId)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, room: data as HouseRoomData };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update room" };
  }
}

export async function setMasterVolumeAction(
  volume: number,
  muted?: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const { data: allRooms } = await admin.from("tank_rooms").select("id, audio_output_config");

    if (allRooms && allRooms.length > 0) {
      for (const r of allRooms) {
        const cfg = (r.audio_output_config as Record<string, any>) || {};
        const nextCfg = {
          ...cfg,
          volume,
          ...(muted !== undefined ? { muted } : {}),
        };
        await admin
          .from("tank_rooms")
          .update({ audio_output_config: nextCfg, updated_at: new Date().toISOString() })
          .eq("id", r.id);
      }
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to set master volume" };
  }
}


// ─── STREAM TELEMETRY INGEST & AGGREGATION ────────────────────────────────────

export type StreamTelemetryBeacon = {
  cameraId: string;
  roomId?: string;
  protocol: "webrtc" | "hls";
  latencyMs?: number;
  stallCount?: number;
  bitrateKbps?: number;
  clientNetworkType?: string;
};

type TelemetryAggregate = {
  lastUpdated: number;
  activeViewers: number;
  totalStalls5m: number;
  avgLatencyMs: number;
  protocolSplit: { webrtc: number; hls: number };
  recentBeacons: (StreamTelemetryBeacon & { timestamp: number })[];
};

const telemetryState: TelemetryAggregate = {
  lastUpdated: Date.now(),
  activeViewers: 0,
  totalStalls5m: 0,
  avgLatencyMs: 0,
  protocolSplit: { webrtc: 0, hls: 0 },
  recentBeacons: [],
};

export async function recordStreamTelemetryAction(
  beacon: StreamTelemetryBeacon
): Promise<{ success: boolean }> {
  try {
    const now = Date.now();
    telemetryState.recentBeacons.push({ ...beacon, timestamp: now });
    
    // Prune beacons older than 5 minutes
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    telemetryState.recentBeacons = telemetryState.recentBeacons.filter(
      (b) => b.timestamp > fiveMinutesAgo
    );

    // Compute aggregates
    const recent = telemetryState.recentBeacons;
    telemetryState.activeViewers = recent.length;
    telemetryState.totalStalls5m = recent.reduce((sum, b) => sum + (b.stallCount || 0), 0);
    const withLatency = recent.filter((b) => typeof b.latencyMs === "number" && b.latencyMs > 0);
    telemetryState.avgLatencyMs = withLatency.length
      ? Math.round(withLatency.reduce((sum, b) => sum + (b.latencyMs || 0), 0) / withLatency.length)
      : 0;

    let webrtc = 0;
    let hls = 0;
    for (const b of recent) {
      if (b.protocol === "webrtc") webrtc++;
      else if (b.protocol === "hls") hls++;
    }
    telemetryState.protocolSplit = { webrtc, hls };
    telemetryState.lastUpdated = now;

    // Asynchronously insert row into public.tank_telemetry_events
    const admin = createAdminClient();
    admin
      .from("tank_telemetry_events")
      .insert({
        camera_id: beacon.cameraId,
        room_id: beacon.roomId || null,
        protocol: beacon.protocol,
        latency_ms: beacon.latencyMs || null,
        stall_count: beacon.stallCount || 0,
        bitrate_kbps: beacon.bitrateKbps || null,
        client_network_type: beacon.clientNetworkType || null,
        created_at: new Date(now).toISOString(),
      })
      .then(
        () => {},
        () => {},
      );

    return { success: true };
  } catch {
    return { success: false };
  }
}

export async function getStreamTelemetrySummaryAction(): Promise<{
  success: boolean;
  summary: {
    activeViewers: number;
    totalStalls5m: number;
    avgLatencyMs: number;
    protocolSplit: { webrtc: number; hls: number };
    lastUpdated: number;
  };
}> {
  return {
    success: true,
    summary: {
      activeViewers: telemetryState.activeViewers,
      totalStalls5m: telemetryState.totalStalls5m,
      avgLatencyMs: telemetryState.avgLatencyMs,
      protocolSplit: telemetryState.protocolSplit,
      lastUpdated: telemetryState.lastUpdated,
    },
  };
}

// ─── INVENTORY & CLAN MANAGEMENT WRITE PATHS ──────────────────────────────────

export async function grantTankInventoryItemAction(
  userId: string,
  itemIdOrSlug: string,
  quantity: number = 1
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    
    // 1. Resolve item id
    let resolvedItemId = itemIdOrSlug;
    const { data: item } = await admin
      .from("tank_inventory_items")
      .select("id")
      .or(`id.eq.${itemIdOrSlug},slug.eq.${itemIdOrSlug}`)
      .maybeSingle();
      
    if (item?.id) {
      resolvedItemId = item.id;
    }

    // 2. Upsert player inventory
    const { data: existing } = await admin
      .from("tank_player_inventory")
      .select("quantity")
      .eq("user_id", userId)
      .eq("item_id", resolvedItemId)
      .maybeSingle();

    if (existing) {
      await admin
        .from("tank_player_inventory")
        .update({
          quantity: existing.quantity + quantity,
          acquired_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("item_id", resolvedItemId);
    } else {
      await admin.from("tank_player_inventory").insert({
        user_id: userId,
        item_id: resolvedItemId,
        quantity: Math.max(1, quantity),
        acquired_at: new Date().toISOString(),
      });
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to grant item" };
  }
}

export async function createTankClanAction(
  name: string,
  tag: string,
  description?: string,
  bannerColor?: string
): Promise<{ success: boolean; clan?: any; error?: string }> {
  try {
    const admin = createAdminClient();
    const cleanTag = tag.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
    const cleanName = name.trim().slice(0, 32);

    const { data: created, error } = await admin
      .from("tank_clicks")
      .insert({
        name: cleanName,
        tag: cleanTag,
        description: description || null,
        banner_color: bannerColor || "#eab308",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, clan: created };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to create clan" };
  }
}
