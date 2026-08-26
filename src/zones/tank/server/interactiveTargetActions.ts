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
  getActiveTargets,
  spawnInteractiveTarget,
  type InteractiveTarget,
  type BoundingBox,
} from "./interactiveTargetDetector";
import { getLevelForXp } from "../xpLevels";
import type { ChatMessage } from "../contracts";
import { recordTankMissionProgress } from "./actions";

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

  // 4. Credit XP & Tokens to User Profile
  const admin = createAdminClient();
  try {
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("xp, tokens")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentXp = profile?.xp ?? 0;
    const currentTokens = profile?.tokens ?? 0;
    const newXp = currentXp + target.xpReward;
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

  // 5. Broadcast Themed System Console Announcement to Chat
  const announcement = `🏆 @${userName} spotted the hidden ${target.label} in ${target.roomTitle}! (+${target.xpReward} XP, +${target.tokenReward} Tokens) [${claimRecord.currentClaims}/${target.maxClaimsPerUser}]`;
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
      xpReward: target.xpReward,
      tokenReward: target.tokenReward,
    },
    claims: claimRecord.currentClaims,
    maxClaims: target.maxClaimsPerUser,
    xpAwarded: target.xpReward,
    tokensAwarded: target.tokenReward,
    message: `Found ${target.label}! (+${target.xpReward} XP, +${target.tokenReward} Tokens)`,
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
  return getActiveTargets();
}
