// src/zones/tank/server/scavengerHuntEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Autonomous YOLO Vision Item Scavenger Hunt Engine
//
// Detects stagnant everyday items, generates real-time community scavenger quests,
// resolves first-to-claim atomic race conditions, and awards gamification rewards.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SCAVENGER_ITEM_CATALOG,
  resolveScavengerItem,
  type ScavengerItemDefinition,
} from "./scavengerCatalog";
import { isTargetHit, type BoundingBoxRect } from "../public/viewportCoordinateMapper";

export type ScavengerQuestState = "IDLE_COOLDOWN" | "QUEST_ACTIVE" | "CLAIMED_FANFARE" | "EXPIRED";

export type ScavengerQuest = {
  id: string;
  roomKey: string;
  roomTitle: string;
  cameraId: string;
  item: ScavengerItemDefinition;
  targetBox: BoundingBoxRect;
  state: ScavengerQuestState;
  startedAt: number;
  expiresAt: number;
  durationSeconds: number;
  claimedBy?: {
    userId: string;
    userName: string;
    claimedAt: number;
    rewardTokens: number;
    rewardXp: number;
  } | null;
};

export type StagnantCandidate = {
  id: string;
  roomKey: string;
  cameraId: string;
  label: string;
  definition: ScavengerItemDefinition;
  box: BoundingBoxRect;
  firstSeenAt: number;
  lastSeenAt: number;
  confidence: number;
};

// In-memory active hunt state
let g_activeQuest: ScavengerQuest | null = null;
let g_nextQuestAvailableAt = 0;
const g_stagnantCandidates = new Map<string, StagnantCandidate>();

export const STAGNANCY_THRESHOLD_MS = 4000; // Must be stationary for 4+ seconds
export const DEFAULT_QUEST_DURATION_S = 60; // 60-second window
export const QUEST_COOLDOWN_MS = 25000; // 25-second cooldown between hunts

/**
 * Ingests raw detected bounding boxes and tracks stationary candidate objects.
 */
export function ingestScavengerCandidates(
  roomKey: string,
  cameraId: string,
  rawBoxes: Array<{ nx: number; ny: number; nw: number; nh: number; label?: string; confidence?: number }>,
  now = Date.now()
): StagnantCandidate[] {
  const activeIds = new Set<string>();

  for (const b of rawBoxes) {
    const def = resolveScavengerItem(b.label);
    if (!def) continue;

    // Spatial clustering key (rounded to 5% grid)
    const gridX = Math.round(b.nx * 20);
    const gridY = Math.round(b.ny * 20);
    const candidateId = `${roomKey}_${def.classLabel}_${gridX}_${gridY}`;
    activeIds.add(candidateId);

    const existing = g_stagnantCandidates.get(candidateId);
    if (existing) {
      existing.lastSeenAt = now;
      existing.confidence = b.confidence ?? 0.8;
      existing.box = { nx: b.nx, ny: b.ny, nw: b.nw, nh: b.nh };
    } else {
      g_stagnantCandidates.set(candidateId, {
        id: candidateId,
        roomKey,
        cameraId,
        label: b.label || def.classLabel,
        definition: def,
        box: { nx: b.nx, ny: b.ny, nw: b.nw, nh: b.nh },
        firstSeenAt: now,
        lastSeenAt: now,
        confidence: b.confidence ?? 0.8,
      });
    }
  }

  // Purge candidates unseen for > 10 seconds
  for (const [id, cand] of g_stagnantCandidates.entries()) {
    if (now - cand.lastSeenAt > 10000) {
      g_stagnantCandidates.delete(id);
    }
  }

  // Return candidates that satisfy stagnancy
  return Array.from(g_stagnantCandidates.values()).filter(
    (c) => now - c.firstSeenAt >= STAGNANCY_THRESHOLD_MS
  );
}

/**
 * Spawns a new Scavenger Hunt Quest from stagnant room candidates or fallback presets.
 */
export function generateScavengerQuest(options?: {
  roomKey?: string;
  itemLabel?: string;
  durationSeconds?: number;
  now?: number;
}): ScavengerQuest {
  const now = options?.now ?? Date.now();
  const duration = options?.durationSeconds ?? DEFAULT_QUEST_DURATION_S;
  const expiresAt = now + duration * 1000;

  let targetCandidate: StagnantCandidate | null = null;
  const eligible = Array.from(g_stagnantCandidates.values()).filter(
    (c) => now - c.firstSeenAt >= STAGNANCY_THRESHOLD_MS
  );

  if (options?.roomKey) {
    targetCandidate = eligible.find((c) => c.roomKey === options.roomKey) || null;
  } else if (eligible.length > 0) {
    // Pick random eligible stagnant item
    targetCandidate = eligible[Math.floor(Math.random() * eligible.length)];
  }

  // Fallback target if room is quiet / synthetic generator
  const fallbackDef = options?.itemLabel
    ? resolveScavengerItem(options.itemLabel) || SCAVENGER_ITEM_CATALOG.cup
    : SCAVENGER_ITEM_CATALOG.cup;

  const roomKey = targetCandidate?.roomKey || options?.roomKey || "living-room";
  const cameraId = targetCandidate?.cameraId || "cam-living-room";
  const targetBox = targetCandidate?.box || { nx: 0.45, ny: 0.65, nw: 0.12, nh: 0.14 };
  const item = targetCandidate?.definition || fallbackDef;

  const questId = `hunt_${now}_${Math.random().toString(36).slice(2, 7)}`;
  const quest: ScavengerQuest = {
    id: questId,
    roomKey,
    roomTitle: roomKey.replace("-", " ").toUpperCase(),
    cameraId,
    item,
    targetBox,
    state: "QUEST_ACTIVE",
    startedAt: now,
    expiresAt,
    durationSeconds: duration,
    claimedBy: null,
  };

  g_activeQuest = quest;
  g_nextQuestAvailableAt = expiresAt + QUEST_COOLDOWN_MS;
  return quest;
}

/**
 * Evaluates a viewer's screen tap against the active scavenger hunt quest.
 * Uses atomic first-to-claim race resolution.
 */
export function claimScavengerQuestTap(params: {
  questId: string;
  userId: string;
  userName: string;
  tapNx: number;
  tapNy: number;
  now?: number;
}): {
  success: boolean;
  reason: string;
  rewardTokens?: number;
  rewardXp?: number;
  quest?: ScavengerQuest | null;
} {
  const now = params.now ?? Date.now();

  if (!g_activeQuest || g_activeQuest.id !== params.questId) {
    return { success: false, reason: "No active quest with this ID." };
  }

  if (g_activeQuest.state !== "QUEST_ACTIVE") {
    return {
      success: false,
      reason: g_activeQuest.claimedBy
        ? `Quest already solved by @${g_activeQuest.claimedBy.userName}!`
        : "Quest has expired.",
    };
  }

  if (now > g_activeQuest.expiresAt) {
    g_activeQuest.state = "EXPIRED";
    return { success: false, reason: "Time expired for this quest!" };
  }

  // Precision bounding box hit-test (with 3.5% tolerance)
  const isHit = isTargetHit(params.tapNx, params.tapNy, g_activeQuest.targetBox, 0.035);
  if (!isHit) {
    return { success: false, reason: "Miss! Tap closer to the item." };
  }

  // ATOMIC FIRST-TO-CLAIM WINNER
  g_activeQuest.state = "CLAIMED_FANFARE";
  g_activeQuest.claimedBy = {
    userId: params.userId,
    userName: params.userName,
    claimedAt: now,
    rewardTokens: g_activeQuest.item.rewardTokens,
    rewardXp: g_activeQuest.item.rewardXp,
  };

  g_nextQuestAvailableAt = now + QUEST_COOLDOWN_MS;

  return {
    success: true,
    reason: `🎯 FOUND! You discovered the ${g_activeQuest.item.displayName}!`,
    rewardTokens: g_activeQuest.item.rewardTokens,
    rewardXp: g_activeQuest.item.rewardXp,
    quest: g_activeQuest,
  };
}

/**
 * Ticks the Scavenger Hunt Engine forward in time.
 */
export function tickScavengerHuntEngine(now = Date.now()): ScavengerQuest | null {
  if (!g_activeQuest) {
    // Check if cooldown elapsed and we should spawn next quest
    if (now >= g_nextQuestAvailableAt && g_stagnantCandidates.size > 0) {
      return generateScavengerQuest({ now });
    }
    return null;
  }

  if (g_activeQuest.state === "QUEST_ACTIVE" && now > g_activeQuest.expiresAt) {
    g_activeQuest.state = "EXPIRED";
  }

  return g_activeQuest;
}

/**
 * Retrieves the currently active scavenger quest.
 */
export function getActiveScavengerQuest(): ScavengerQuest | null {
  return g_activeQuest;
}

/**
 * Explicitly clears the active scavenger quest (testing / operator reset).
 */
export function clearScavengerQuest(): void {
  g_activeQuest = null;
  g_stagnantCandidates.clear();
  g_nextQuestAvailableAt = 0;
}
