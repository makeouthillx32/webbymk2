"use server";

// src/zones/tank/server/interactiveTargetActions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Interactive Target & Object Scavenger Server Actions
//
// Receives client taps, runs sub-millisecond bounding box hit tests,
// credits XP & tokens to user profile, and broadcasts system console messages.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  evaluateTapHitTest,
  recordUserTargetClaim,
  calculateTargetAgeXp,
  clearInteractiveTarget,
  getActiveTargets,
  spawnInteractiveTarget,
  type InteractiveTarget,
  type BoundingBox,
} from "./interactiveTargetDetector";
import { getLevelForXp } from "../xpLevels";
import type { ChatMessage } from "../contracts";
import { recordTankMissionProgress } from "./actions";
import { requireStaff } from "./staffAuth";

export type TapClaimResult = {
  hit: boolean;
  target?: {
    id: string;
    label: string;
    kind: string;
    roomTitle: string;
    xpReward: number;
    tokenReward: number;
  };
  claims?: number;
  maxClaims?: number;
  xpAwarded?: number;
  tokensAwarded?: number;
  message?: string;
  error?: string;
};

/**
 * Evaluates a viewer's screen tap against active targets in the room.
 */
export async function claimInteractiveTargetTap(params: {
  camSlug: string;
  roomId?: string;
  nx: number;
  ny: number;
}): Promise<TapClaimResult> {
  const { camSlug, roomId = "director", nx, ny } = params;

  if (
    typeof camSlug !== "string" ||
    !camSlug.trim() ||
    !Number.isFinite(nx) ||
    !Number.isFinite(ny) ||
    nx < 0 ||
    nx > 1 ||
    ny < 0 ||
    ny > 1
  ) {
    return { hit: false, error: "Invalid target coordinates." };
  }

  // 1. Authenticate Viewer
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { hit: false, error: "Sign in to claim scavenger bounties." };
  }

  // 2. Perform Bounding Box Hit-Test
  const target = evaluateTapHitTest(camSlug, nx, ny);
  if (!target) {
    return { hit: false };
  }

  // 3. Verify Claim Quota
  const claimRecord = recordUserTargetClaim(user.id, target.id, target.maxClaimsPerUser);
  if (!claimRecord.allowed) {
    return {
      hit: true,
      target: {
        id: target.id,
        label: target.label,
        kind: target.kind,
        roomTitle: target.roomTitle,
        xpReward: 0,
        tokenReward: 0,
      },
      claims: claimRecord.currentClaims,
      maxClaims: target.maxClaimsPerUser,
      message: `You already claimed all ${target.maxClaimsPerUser} bounties for this ${target.label}!`,
    };
  }

  const userName =
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.user_name as string) ||
    user.email?.split("@")[0] ||
    "Spectator";

  // 4. Calculate Age Bonus & Total XP
  const { ageMinutes, ageBonusXp, totalXp } = calculateTargetAgeXp(target);

  // If this target is trash or clutter, mark it cleared so it vanishes from the room
  if (target.kind === "trash" || target.kind === "clutter") {
    clearInteractiveTarget(target.id);
  }

  // 5. Credit XP & Tokens to User Profile
  const admin = createAdminClient();
  try {
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("xp, tokens")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentXp = profile?.xp ?? 0;
    const currentTokens = profile?.tokens ?? 0;
    const newXp = currentXp + totalXp;
    const newTokens = currentTokens + target.tokenReward;
    const newLevel = getLevelForXp(newXp);

    await admin.from("tank_profiles").upsert(
      {
        user_id: user.id,
        xp: newXp,
        tokens: newTokens,
        level: newLevel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.error("[ScavengerEngine] Failed to credit profile XP:", err);
  }

  // 6. Broadcast Themed System Console Announcement to Chat
  const isTrash = target.kind === "trash" || target.kind === "clutter";
  const bonusText = ageBonusXp > 0 ? ` (+${ageBonusXp} XP for ${ageMinutes}m Dwell)` : "";
  const announcement = isTrash
    ? `🧹 @${userName} cleared the ${target.label} in ${target.roomTitle}! (+${totalXp} XP${bonusText}, +${target.tokenReward} Tokens) [TRASH CLEARED]`
    : `🏆 @${userName} spotted the hidden ${target.label} in ${target.roomTitle}! (+${totalXp} XP, +${target.tokenReward} Tokens) [${claimRecord.currentClaims}/${target.maxClaimsPerUser}]`;

  const msgId = `sys_scavenger_${Date.now()}`;
  const nowStr = new Date().toLocaleString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });

  const chatMsg: ChatMessage = {
    id: msgId,
    user: "SYSTEM",
    body: announcement,
    time: nowStr,
    messageType: "system",
  };

  try {
    await admin.from("tank_chat_messages").insert({
      room_id: roomId,
      user_id: null,
      user_name: "SYSTEM",
      user_role: "system",
      body: announcement,
      message_type: "system",
    });

    const channel = admin.channel(`room:${roomId}:chat`);
    await channel.send({
      type: "broadcast",
      event: "new_message",
      payload: chatMsg,
    });
  } catch {}

  void recordTankMissionProgress("find_scavenger_target", 1, user.id);

  return {
    hit: true,
    target: {
      id: target.id,
      label: target.label,
      kind: target.kind,
      roomTitle: target.roomTitle,
      xpReward: totalXp,
      tokenReward: target.tokenReward,
    },
    claims: claimRecord.currentClaims,
    maxClaims: target.maxClaimsPerUser,
    xpAwarded: totalXp,
    tokensAwarded: target.tokenReward,
    message: isTrash
      ? `Cleared ${target.label}! (+${totalXp} XP${bonusText}, +${target.tokenReward} Tokens)`
      : `Found ${target.label}! (+${totalXp} XP, +${target.tokenReward} Tokens)`,
  };
}

/**
 * Director Action: Spawns a new clutter / scavenger bounty
 */
export async function createDirectorScavengerTarget(params: {
  camSlug: string;
  roomKey: string;
  roomTitle: string;
  label: string;
  kind?: "trash" | "clutter" | "easter_egg" | "toy" | "waldo";
  box: BoundingBox;
  xpReward?: number;
  tokenReward?: number;
  durationMinutes?: number;
}): Promise<{ success: boolean; target?: InteractiveTarget; error?: string }> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Staff access required." };
    const target = spawnInteractiveTarget(params);
    return { success: true, target };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to spawn target." };
  }
}

/**
 * Fetches active targets for Director display
 */
export async function getDirectorActiveTargets(): Promise<InteractiveTarget[]> {
  if (!(await requireStaff())) return [];
  return getActiveTargets();
}


/**
 * Lists all interactive trash and scavenger targets with live age calculations.
 */
export async function listTrashTargetsAction(): Promise<{
  success: boolean;
  targets: Array<
    InteractiveTarget & {
      ageMinutes: number;
      ageBonusXp: number;
      totalXp: number;
    }
  >;
  error?: string;
}> {
  try {
    if (!(await requireStaff())) return { success: false, targets: [], error: "Staff access required." };
    const targets = getActiveTargets();
    const now = Date.now();
    const enriched = targets.map((t) => {
      const ageInfo = calculateTargetAgeXp(t, now);
      return {
        ...t,
        ...ageInfo,
      };
    });
    return { success: true, targets: enriched };
  } catch (err: any) {
    return { success: false, targets: [], error: err?.message || "Failed to list targets." };
  }
}

/**
 * Creates a new interactive trash or scavenger bounty from House Console.
 */
export async function createTrashTargetAction(params: {
  camSlug: string;
  roomKey: string;
  roomTitle: string;
  label: string;
  kind?: "trash" | "clutter" | "easter_egg" | "toy" | "waldo";
  box: BoundingBox;
  xpReward?: number;
  tokenReward?: number;
  durationMinutes?: number;
}): Promise<{ success: boolean; target?: InteractiveTarget; error?: string }> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Staff access required." };
    const target = spawnInteractiveTarget(params);
    return { success: true, target };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to create target." };
  }
}

/**
 * Clears an active trash target manually from House Console.
 */
export async function clearTrashTargetAction(
  targetId: string,
  clearedBy = "House Staff"
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(await requireStaff())) return { success: false, error: "Staff access required." };
    const res = clearInteractiveTarget(targetId);
    if (!res.cleared || !res.target) {
      return { success: false, error: "Target not found or already cleared." };
    }

    const admin = createAdminClient();
    const announcement = `🧹 [HOUSE EVENT] ${clearedBy} cleaned up "${res.target.label}" in ${res.target.roomTitle}! [TRASH CLEARED]`;
    const msgId = `sys_trash_clear_${Date.now()}`;
    const nowStr = new Date().toLocaleString([], {
      month: "numeric",
      day: "numeric",
      year: "2-digit",
      hour: "numeric",
      minute: "2-digit",
    });

    const chatMsg: ChatMessage = {
      id: msgId,
      user: "SYSTEM",
      body: announcement,
      time: nowStr,
      messageType: "system",
    };

    try {
      await admin.from("tank_chat_messages").insert({
        room_id: res.target.roomKey || "director",
        user_id: null,
        user_name: "SYSTEM",
        user_role: "system",
        body: announcement,
        message_type: "system",
      });

      const channel = admin.channel(`room:${res.target.roomKey || "director"}:chat`);
      await channel.send({
        type: "broadcast",
        event: "new_message",
        payload: chatMsg,
      });
    } catch {}

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to clear target." };
  }
}

/**
 * Re-seeds the default catalog of trash and clutter targets.
 */
export async function resetDefaultTrashTargetsAction(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    if (!(await requireStaff())) return { success: false, count: 0, error: "Staff access required." };
    const defaultTargets = [
      {
        camSlug: "living-room",
        roomKey: "living-room",
        roomTitle: "Living Room",
        label: "Crushed Energy Drink Can",
        kind: "trash" as const,
        box: { xMin: 0.15, yMin: 0.65, xMax: 0.35, yMax: 0.85 },
        xpReward: 25,
        tokenReward: 15,
        durationMinutes: 240,
      },
      {
        camSlug: "kitchen",
        roomKey: "kitchen",
        roomTitle: "Kitchen",
        label: "Forgotten Pizza Box",
        kind: "trash" as const,
        box: { xMin: 0.20, yMin: 0.50, xMax: 0.45, yMax: 0.75 },
        xpReward: 30,
        tokenReward: 15,
        durationMinutes: 240,
      },
      {
        camSlug: "game-room",
        roomKey: "game-room",
        roomTitle: "Game Room",
        label: "Fallen Arcade Joystick",
        kind: "clutter" as const,
        box: { xMin: 0.70, yMin: 0.55, xMax: 0.90, yMax: 0.75 },
        xpReward: 40,
        tokenReward: 25,
        durationMinutes: 240,
      },
      {
        camSlug: "kitchen",
        roomKey: "kitchen",
        roomTitle: "Kitchen",
        label: "Golden Coffee Mug",
        kind: "easter_egg" as const,
        box: { xMin: 0.55, yMin: 0.35, xMax: 0.75, yMax: 0.55 },
        xpReward: 50,
        tokenReward: 30,
        durationMinutes: 240,
      },
    ];

    let count = 0;
    for (const t of defaultTargets) {
      spawnInteractiveTarget(t);
      count++;
    }

    return { success: true, count };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || "Failed to reset defaults." };
  }
}
