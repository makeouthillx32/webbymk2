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
  executeItemFlex,
  ITEM_ACTION_DEFINITIONS,
} from "./chatRngEvents";
import { tryFireOverlayFx, isOverlayFxEnabled, setOverlayFxEnabled } from "./overlayFxStore";
import { checkChatActivityTriggers } from "./overlays";
import {
  getEffectiveMode,
  loadPersistedOperatorModeFromDb,
  persistOperatorModeToDb,
} from "./directorTelemetryStore";
import { recordMovementLog } from "./directorMovementLogStore";
import type { SubjectMode } from "./directorVirtualAtlas";
import {
  getDirectorFeedPriorities,
  setDirectorFeedPriorities,
  setDirectorAttention,
  type DirectorFeedPriorities,
  DEFAULT_DIRECTOR_FEED_PRIORITIES,
} from "./directorAttentionDb";
import { requireStaff } from "./staffAuth";
import { TANK_ITEM_CATALOG } from "../tankItemCatalog";
import { resolveTankDisplayName } from "../identity";
import { extractImageIdsFromText } from "./chatAttachments";
import { getProviderGuild } from "./externalChatContract";



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

import { getCurrentTankProfile } from "./gamification";
import {
  claimScavengerQuestTap,
  generateScavengerQuest,
  getActiveScavengerQuest,
  type ScavengerQuest,
} from "./scavengerHuntEngine";
import type { TankPlayerProfile } from "./gamification";

// Thin "use server" wrapper — gamification.ts itself has no "use server"
// directive (it's a plain server-only data-access module, safe to import
// from other server code but not as a runtime value from client code), so
// client components that need a fresh profile read after an action settles
// (Bazaar buyout/bid/listing) call this instead of gamification.ts directly.
export async function refreshTankProfile(): Promise<TankPlayerProfile | null> {
  return getCurrentTankProfile();
}

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
  const [{ data: platformProfile }, { data: beforeTankProfile }, { data: clickMembership }] = await Promise.all([
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
    // Click membership lives in tank_click_members (RLS: readable only by the
    // member themself), not a denormalized profiles.clan_id column — service
    // role reads it here so the tag can render on every viewer's copy of the
    // message, same precedent as tank_leaderboard already surfacing it publicly.
    adminSupabase
      .from("tank_click_members")
      .select("tank_clicks(tag, banner_color)")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const clickClan = clickMembership?.tank_clicks
    ? (Array.isArray(clickMembership.tank_clicks) ? clickMembership.tank_clicks[0] : clickMembership.tank_clicks)
    : undefined;

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

    // Was a separate, sequential, awaited re-fetch of tank_profiles here,
    // purely to detect a level-up — a whole extra DB round trip gating the
    // broadcast below on every single message. Nothing in this function or
    // the tank_insert_chat_message RPC actually grants XP, so level-up
    // detection only ever matters for the rare case where something else
    // (e.g. watch-time accrual) changed the profile concurrently — not worth
    // blocking every message on. Confirmed via git history this refetch was
    // introduced in a broad Aug 25 refactor that wasn't about chat latency at
    // all; console/system messages never had it and were never slow.
    // The outgoing message's own level/rank now come straight from
    // beforeTankProfile (already fetched for free above) via the pure,
    // synchronous level/rank functions — zero extra round trips. Real
    // level-up detection moved to a fire-and-forget block AFTER the
    // broadcast, below.
    const newXp = beforeTankProfile?.xp ?? 0;
    const newLevel = beforeTankProfile?.level ?? getLevelForXp(newXp);
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
      ...(clickClan?.tag ? { clanTag: clickClan.tag } : {}),
      ...(clickClan?.banner_color ? { clanColor: clickClan.banner_color } : {}),
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
        await channel.send({
          type: "broadcast",
          event: "new_message",
          payload: chatMsg,
        });
      } catch (broadcastErr) {
        console.error("[ChatSend] Realtime broadcast failed:", broadcastErr);
      } finally {
        await adminSupabase.removeChannel(channel);
      }
    }

    // 4. Level-up detection + announcement — fire-and-forget, runs after the
    // broadcast above so the message is already visible to everyone before
    // this does its own (now off-critical-path) profile re-fetch. Replaces
    // the old awaited afterTankProfile fetch that used to gate the broadcast.
    if (!isClickChat) {
      void (async () => {
        const { data: afterTankProfile } = await adminSupabase
          .from("tank_profiles")
          .select("xp, level")
          .eq("user_id", user.id)
          .maybeSingle();
        const postLevel = afterTankProfile?.level ?? getLevelForXp(afterTankProfile?.xp ?? 0);
        const preLevel = beforeTankProfile?.level ?? getLevelForXp(beforeTankProfile?.xp ?? 0);
        if (postLevel > preLevel) {
          await sendSystemConsoleAnnouncement(
            roomId,
            `🎉 [LEVEL UP] @${userName} reached Level ${postLevel}! Rank Unlocked: ${getRankForLevel(postLevel)}!`,
            "level_up",
          );
        }
      })().catch((err) => console.error("[ChatSend] level-up check failed:", { userId: user.id, roomId, err }));
    }

    // 5. Check if message answers an active Chat Minigame (Trivia / Camera Scavenger)
    if (!isClickChat) {
      void processMinigameAnswer(user.id, userName, roomId, trimmed)
        .catch((err) => console.error("[ChatSend] processMinigameAnswer failed:", { userId: user.id, roomId, err }));
    }

    // 6. Manual Staff / Command Minigame Triggers (!trivia, !quest, /trivia, /quest)
    // Was `try { void fn() } catch {}` at every one of these six call sites —
    // dead code: `void` discards the promise, so the try/catch could only
    // ever catch a synchronous throw from starting the call, never a real
    // async rejection from inside it. Every failure here was silently
    // invisible. Replaced with `.catch()` on the promise itself so a real
    // error actually surfaces in logs instead of vanishing — still
    // fire-and-forget on purpose (awaiting any of these would put it back on
    // sendChatMessage's critical path, which is what made chat slow in the
    // first place, see the level-up refetch removed above).
    const lowerText = trimmed.toLowerCase();
    if (!isClickChat && (lowerText === "!trivia" || lowerText === "/trivia")) {
      void triggerHouseTriviaRound(roomId)
        .catch((err) => console.error("[ChatSend] triggerHouseTriviaRound failed:", { roomId, err }));
    } else if (!isClickChat && (lowerText === "!quest" || lowerText === "/quest")) {
      void triggerCameraScavengerQuest(roomId)
        .catch((err) => console.error("[ChatSend] triggerCameraScavengerQuest failed:", { roomId, err }));
    } else if (!isClickChat && (lowerText === "!multiplier" || lowerText === "/multiplier")) {
      void triggerHouseMultiplierEvent(2, 15, roomId)
        .catch((err) => console.error("[ChatSend] triggerHouseMultiplierEvent failed:", { roomId, err }));
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
    //
    // Was `try { void processChatRngTrigger(...) } catch {}` — dead code, see
    // the comment above: `void` discards the promise so this could never
    // catch a real failure inside /roll, /unbox, or any other RNG command.
    // Confirmed live 2026-08-31 as the reason /roll and /unbox appeared to
    // silently do nothing — any real error was an invisible unhandled
    // promise rejection. Still fire-and-forget (not awaited) on purpose.
    if (!isClickChat) {
      void processChatRngTrigger(user.id, userName, roomId, trimmed)
        .catch((err) => console.error("[ChatRngTrigger] processChatRngTrigger failed:", { userId: user.id, roomId, trimmed, err }));
    }

    // Check for periodic Discord console message broadcast
    if (!isClickChat) {
      void checkAndTriggerDiscordAnnouncement(roomId)
        .catch((err) => console.error("[ChatSend] checkAndTriggerDiscordAnnouncement failed:", { roomId, err }));
    }

    // Activity-driven overlay triggers
    if (!isClickChat) {
      void checkChatActivityTriggers(roomId, trimmed)
        .catch((err) => console.error("[ChatSend] checkChatActivityTriggers failed:", { roomId, err }));
    }

    // Periodic Chat Events Cron Helper (e.g. Trivia every 15 mins)
    if (!isClickChat) {
      void triggerPeriodicChatEvents(roomId)
        .catch((err) => console.error("[ChatSend] triggerPeriodicChatEvents failed:", { roomId, err }));
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
      // Chaos items: the RPC path consumes the item but knows nothing about
      // overlay fx, so fire it here — same gates (kill-switch, cooldown) as
      // the fallback path in executeItemUsage. Failure degrades to a normal
      // item use, never a dead button.
      const chaosFx = TANK_ITEM_CATALOG[itemSlug]?.overlayFx;
      if (chaosFx) {
        try {
          await tryFireOverlayFx({
            userId: user.id,
            triggeredBy: userName,
            texture: chaosFx.texture,
            durationSec: chaosFx.durationSec,
          });
        } catch (err) {
          console.error("[UseTankItem] overlay fx failed:", err);
        }
      }

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

/**
 * Shows off an owned item in chat without consuming it ("Trophy Catch"
 * flex). Unlike useTankItem, this works for ANY item in TANK_ITEM_CATALOG —
 * not just the ITEM_ACTION_DEFINITIONS subset with a "use" effect — since
 * pure collectibles are exactly the kind of thing worth flexing.
 */
export async function flexTankItem(
  itemSlug: string,
  roomId = "director",
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to flex items." };

  const userName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.user_name as string) ||
    user.email?.split("@")[0] ||
    "Member";

  return executeItemFlex(user.id, userName, roomId, itemSlug);
}

export async function getRecentChatMessages(roomId: string): Promise<ChatMessage[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_chat_messages")
      .select("id, user_id, user_name, user_role, body, created_at, message_type, item_slug, metadata, client_nonce, reply_to_message_id, reply_to_user_id, source_provider, source_message_id, source_channel_id, source_user_id, source_avatar_url, source_name_color, source_badges")
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
    const clanByUserId = new Map<string, { tag: string; bannerColor?: string }>();

    if (userIds.length > 0) {
      try {
        const [{ data: profiles }, { data: coreProfiles }, { data: clickMemberships }] = await Promise.all([
          supabase
            .from("tank_profiles")
            .select("user_id, xp, level")
            .in("user_id", userIds),
          supabase
            .from("profiles")
            .select("id, avatar_url")
            .in("id", userIds),
          // tank_click_members RLS only allows reading your own row, so a
          // service-role read is required to resolve every sender's Click tag
          // — same reasoning as sendChatMessage's clickMembership lookup.
          createAdminClient()
            .from("tank_click_members")
            .select("user_id, tank_clicks(tag, banner_color)")
            .in("user_id", userIds),
        ]);

        for (const row of clickMemberships ?? []) {
          const clan = Array.isArray(row.tank_clicks) ? row.tank_clicks[0] : row.tank_clicks;
          if (clan?.tag) clanByUserId.set(row.user_id, { tag: clan.tag, bannerColor: clan.banner_color || undefined });
        }

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
      const sourceProvider = (row.source_provider || "tank") as NonNullable<ChatMessage["sourceProvider"]>;
      const isExternalProvider = sourceProvider !== "tank";
      const hasNoSender =
        (!row.user_id && !isExternalProvider) ||
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

      if (isExternalProvider) {
        const guild = getProviderGuild(sourceProvider);
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const clanTag = (typeof metadata.clan_tag === "string" && metadata.clan_tag) || guild?.tag;
        const clanColor = (typeof metadata.clan_color === "string" && metadata.clan_color) || guild?.bannerColor;

        return {
          id: row.id,
          user: row.user_name,
          body: row.body,
          time,
          createdAt: row.created_at,
          role: "viewer",
          avatarUrl: row.source_avatar_url || undefined,
          nameColor: row.source_name_color || undefined,
          messageType: "text",
          sourceProvider,
          sourceMessageId: row.source_message_id || undefined,
          sourceChannelId: row.source_channel_id || undefined,
          sourceUserId: row.source_user_id || undefined,
          sourceBadges: Array.isArray(row.source_badges)
            ? row.source_badges.filter((badge): badge is string => typeof badge === "string")
            : [],
          ...(clanTag ? { clanTag } : {}),
          ...(clanColor ? { clanColor } : {}),
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
      const clan = row.user_id ? clanByUserId.get(row.user_id) : undefined;

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
        ...(clan?.tag ? { clanTag: clan.tag } : {}),
        ...(clan?.bannerColor ? { clanColor: clan.bannerColor } : {}),
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
    void recordTankMissionProgress("sign_in_first_time", 1, user.id);

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

export type PrizeReelSlot = {
  slug: string;
  name: string;
  iconUrl: string;
  rarity: string;
};

// One canonical reel — same list backs both the visual strip and the actual
// weighted roll, so what a spin can land on and what the reel displays can
// never drift apart. Slugs pulled from ITEM_ACTION_DEFINITIONS (already
// imported above) rather than a second catalog import.
const PRIZE_REEL: { slug: string; weight: number }[] = [
  { slug: "battery", weight: 30 },
  { slug: "broken-monitor", weight: 22 },
  { slug: "love-letter", weight: 18 },
  { slug: "boxing-gloves", weight: 12 },
  { slug: "lightsaber", weight: 10 },
  { slug: "test-haunted-phone", weight: 5 },
  { slug: "test-golden-remote", weight: 2.5 },
  { slug: "test-tank-heart", weight: 0.5 },
];

const PRIZE_SPIN_COST = 50;

function buildPrizeReelSlots(): PrizeReelSlot[] {
  return PRIZE_REEL.map(({ slug }) => {
    const def = ITEM_ACTION_DEFINITIONS[slug];
    return {
      slug,
      name: def?.name ?? slug,
      iconUrl: def?.iconUrl ?? "",
      rarity: def?.rarity ?? "common",
    };
  });
}

/**
 * spinTankPrizeMachine
 *
 * The one real prize-spin path — deducts tokens from tank_profiles, rolls a
 * weighted pick from PRIZE_REEL, and writes the won item straight to
 * tank_player_inventory. Returns the full reel plus the winning index so the
 * UI can animate the strip landing on the result instead of just popping a
 * result in.
 */
export async function spinTankPrizeMachine(): Promise<{
  success: boolean;
  reel?: PrizeReelSlot[];
  winningIndex?: number;
  wonSlug?: string;
  wonName?: string;
  newTokens?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to spin the prize machine." };

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("tank_profiles")
    .select("tokens, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const currentTokens = profile?.tokens || 0;
  if (currentTokens < PRIZE_SPIN_COST) {
    return {
      success: false,
      error: `Not enough tokens! You have ${currentTokens} (Need ${PRIZE_SPIN_COST}).`,
    };
  }

  // Spend, not a reward — deliberately does NOT go through tank_grant_reward
  // (that boundary is reward-only; the spec's own exclusion list names
  // "spends, wagers" explicitly). This insert's AFTER INSERT trigger on
  // tank_token_transactions already applies the -PRIZE_SPIN_COST delta to
  // tank_profiles.tokens — the manual UPDATE that used to sit here was a
  // real, live double-charge bug (players paid 2x the intended spin cost).
  // Computed (not written) purely so the response can report the post-spend
  // balance immediately without a re-read.
  const tokensAfterCost = currentTokens - PRIZE_SPIN_COST;
  await admin.from("tank_token_transactions").insert({
    user_id: user.id,
    amount: -PRIZE_SPIN_COST,
    reason: "Prize Machine Spin",
  });

  const totalWeight = PRIZE_REEL.reduce((sum, slot) => sum + slot.weight, 0);
  let roll = Math.random() * totalWeight;
  let winningIndex = PRIZE_REEL.length - 1;
  for (let i = 0; i < PRIZE_REEL.length; i++) {
    if (roll < PRIZE_REEL[i].weight) {
      winningIndex = i;
      break;
    }
    roll -= PRIZE_REEL[i].weight;
  }
  const won = PRIZE_REEL[winningIndex];
  const wonDef = ITEM_ACTION_DEFINITIONS[won.slug];

  // Centralized, locked, max-stack-aware grant (Tavern Phase 0) — replaces
  // this function's own select-then-upsert, which was one of several
  // independently-duplicated copies of the same unlocked, uncapped logic.
  await admin.rpc("tank_grant_inventory_item", {
    p_user_id: user.id,
    p_item_slug: won.slug,
    p_quantity: 1,
    p_source: "prize_machine",
  });

  const userName = profile?.display_name || user.email?.split("@")[0] || "Viewer";
  const consoleNotice = `[SYSTEM CONSOLE] 🎰 ${userName} spun the Prize Machine and won ${wonDef?.name ?? won.slug}!`;

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
    reel: buildPrizeReelSlots(),
    winningIndex,
    wonSlug: won.slug,
    wonName: wonDef?.name ?? won.slug,
    newTokens: tokensAfterCost,
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


export async function setDirectorModeAction(
  mode: SubjectMode,
  _operatorName = "Operator",
): Promise<{ success: boolean; mode: SubjectMode; error?: string }> {
  try {
    const staff = await requireStaff();
    if (!staff) {
      return { success: false, mode: getEffectiveMode(), error: "Staff access required." };
    }
    const trustedOperator = `${staff.role}:${staff.id}`;
    await persistOperatorModeToDb(mode, trustedOperator);

    // Broadcast change across Realtime channel
    const admin = createAdminClient();
    const channel = admin.channel("tank:director:state");
    await channel.send({
      type: "broadcast",
      event: "director_mode_changed",
      payload: {
        mode,
        operator: trustedOperator,
        timestamp: Date.now(),
      },
    });

    // Record audit log entry
    recordMovementLog({
      eventType: "auto_cut",
      operator: { user: trustedOperator, connectionType: "browser_web" },
      source: {
        roomId: "director",
        cameraName: "Director",
        panX: 0,
        panY: 0,
        zoom: 1,
      },
      trajectory: {
        vx: 0,
        vy: 0,
        deltaX: 0,
        deltaY: 0,
        deltaZoom: 0,
        easingCurve: `mode:${mode}`,
      },
    });

    return { success: true, mode };
  } catch (err: any) {
    return {
      success: false,
      mode: getEffectiveMode(),
      error: err?.message || "Failed to set director mode",
    };
  }
}

export async function getDirectorModeAction(): Promise<{ success: boolean; mode: SubjectMode }> {
  try {
    await loadPersistedOperatorModeFromDb(true);
    return { success: true, mode: getEffectiveMode() };
  } catch {
    return { success: false, mode: getEffectiveMode() };
  }
}

// Chaos-item overlay fx kill-switch, for the House Console. Read/write go
// through the "use server" wrapper like every other console toggle so the
// client component never touches the store module directly.
export async function getOverlayFxEnabledAction(): Promise<{ success: boolean; enabled: boolean }> {
  try {
    return { success: true, enabled: await isOverlayFxEnabled() };
  } catch {
    return { success: false, enabled: true };
  }
}

export async function setOverlayFxEnabledAction(enabled: boolean): Promise<{ success: boolean }> {
  try {
    await setOverlayFxEnabled(enabled);
    return { success: true };
  } catch {
    return { success: false };
  }
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
  /**
   * Admin kill-switch. When true, roomProjection.ts's deriveRooms() omits
   * this room from every public response entirely — not flagged-but-hidden,
   * actually absent. See the migration comment on tank_rooms.is_offline.
   */
  is_offline: boolean;
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
    isOffline?: boolean;
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
    if (updates.isOffline !== undefined) updatePayload.is_offline = updates.isOffline;

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

/**
 * Bulk kill-switch for the "ALL ROOMS OFF"/"ALL ROOMS ON" panic button.
 * Deliberately updates every row already listed in tank_rooms (what
 * listHouseRoomsAction/houseRooms already shows the operator) rather than
 * re-deriving from cameras — the operator is looking at exactly the rooms
 * this should apply to.
 */
export async function setAllHouseRoomsOfflineAction(
  isOffline: boolean
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Staff access required." };
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("tank_rooms")
      .update({ is_offline: isOffline, updated_at: new Date().toISOString() })
      .not("id", "is", null) // Supabase requires an explicit filter on bulk update
      .select("id");

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, count: data?.length ?? 0 };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to toggle all rooms" };
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

// ─── Tank Messenger (1:1 DMs) ───────────────────────────────────────────────
// Conversations live in tank_dm_conversations; the messages themselves reuse
// tank_chat_messages via room_id = "dm:<conversationId>" — see the
// 20260826150000_tank_direct_messages migration for the RLS/RPC side of this.

export type TankDmConversationSummary = {
  id: string;
  otherUserId: string;
  otherDisplayName: string;
  otherAvatarUrl: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
};

export async function listMyDmConversations(): Promise<TankDmConversationSummary[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("tank_dm_conversations")
    .select("id, user_a_id, user_b_id, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (!rows || rows.length === 0) return [];

  const otherIds = rows.map((r) => (r.user_a_id === user.id ? r.user_b_id : r.user_a_id));
  const admin = createAdminClient();
  const [{ data: profiles }, { data: lastMessages }] = await Promise.all([
    admin.from("profiles").select("id, display_name, avatar_url").in("id", otherIds),
    admin
      .from("tank_chat_messages")
      .select("room_id, body, created_at")
      .in("room_id", rows.map((r) => `dm:${r.id}`))
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  // Rows arrive newest-first, so the first hit per room_id is the preview.
  const previewMap = new Map<string, string>();
  for (const m of lastMessages ?? []) {
    if (!previewMap.has(m.room_id)) previewMap.set(m.room_id, m.body);
  }

  return rows.map((r) => {
    const otherId = r.user_a_id === user.id ? r.user_b_id : r.user_a_id;
    const profile = profileMap.get(otherId);
    return {
      id: r.id,
      otherUserId: otherId,
      otherDisplayName: profile?.display_name || "Viewer",
      otherAvatarUrl: profile?.avatar_url || null,
      lastMessageAt: r.last_message_at,
      lastMessageBody: previewMap.get(`dm:${r.id}`) ?? null,
    };
  });
}

export type StartDmResult = { success: boolean; conversationId?: string; error?: string };

export async function startDmConversation(otherUserId: string): Promise<StartDmResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Sign in required to message another viewer." };
  if (!otherUserId || otherUserId === user.id) {
    return { success: false, error: "Choose another viewer to message." };
  }

  const { data, error } = await supabase.rpc("tank_get_or_create_dm", {
    p_other_user_id: otherUserId,
  });
  if (error || !data) {
    return { success: false, error: error?.message ?? "Could not start that conversation." };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { success: true, conversationId: row.id };
}

export type TankMessengerContact = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function searchTankViewers(query: string): Promise<TankMessengerContact[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .ilike("display_name", `%${trimmed}%`)
    .neq("id", user.id)
    .limit(10);

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name || "Viewer",
    avatarUrl: p.avatar_url || null,
  }));
}


// ════════════════════════════════════════════════════════════════════════════
// 🕵️ DYNAMIC YOLO VISION SCAVENGER HUNT ACTIONS
// ════════════════════════════════════════════════════════════════════════════

export async function getActiveScavengerQuestAction(): Promise<ScavengerQuest | null> {
  return getActiveScavengerQuest();
}

export async function triggerScavengerHuntAction(options?: {
  roomKey?: string;
  itemLabel?: string;
  durationSeconds?: number;
}): Promise<ScavengerQuest> {
  const quest = generateScavengerQuest(options);

  // Broadcast quest spawn to chat
  try {
    const admin = createAdminClient();
    await admin.channel("tank:scavenger:events").send({
      type: "broadcast",
      event: "new_quest",
      payload: quest,
    });

    await sendSystemConsoleAnnouncement(
      quest.roomKey || "director",
      `🕵️ [SCAVENGER QUEST] Spot the [${quest.item.displayName}] in ${quest.roomTitle}! Tap the item on screen for +${quest.item.rewardTokens} Tokens & +${quest.item.rewardXp} XP! (⏱️ ${quest.durationSeconds}s)`,
      "house_event"
    );
  } catch (err) {
    console.error("[ScavengerHunt] Failed to broadcast quest announcement:", err);
  }

  return quest;
}

export async function claimScavengerBountyAction(params: {
  questId: string;
  tapNx: number;
  tapNy: number;
}): Promise<{
  success: boolean;
  reason: string;
  rewardTokens?: number;
  rewardXp?: number;
}> {
  const profile = await getCurrentTankProfile();
  const userId = profile?.id || "anonymous";
  const userName = profile?.displayName || "Viewer";

  const result = claimScavengerQuestTap({
    questId: params.questId,
    userId,
    userName,
    tapNx: params.tapNx,
    tapNy: params.tapNy,
    now: Date.now(),
  });

  if (result.success && result.quest) {
    try {
      const admin = createAdminClient();

      // Award tokens and XP in database
      if (profile && profile.id) {
        await admin.rpc("increment_tank_profile_rewards", {
          p_user_id: profile.id,
          p_xp: result.rewardXp || 0,
          p_tokens: result.rewardTokens || 0,
        });
      }

      // Broadcast victory fanfare
      await admin.channel("tank:scavenger:events").send({
        type: "broadcast",
        event: "quest_claimed",
        payload: result.quest,
      });

      await sendSystemConsoleAnnouncement(
        result.quest.roomKey || "director",
        `🎉 [QUEST SOLVED] @${userName} found the [${result.quest.item.displayName}] in ${result.quest.roomTitle}! Awarded +${result.rewardTokens} Tokens & +${result.rewardXp} XP! 🎯`,
        "house_event"
      );
    } catch (err) {
      console.error("[ScavengerHunt] Error saving rewards / broadcasting fanfare:", err);
    }
  }

  return {
    success: result.success,
    reason: result.reason,
    rewardTokens: result.rewardTokens,
    rewardXp: result.rewardXp,
  };
}
