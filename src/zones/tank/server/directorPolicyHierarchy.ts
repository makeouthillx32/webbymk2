// src/zones/tank/server/directorPolicyHierarchy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hardened Director Policy Hierarchy & Override Timeline Engine
//
// Resolves director decisions across a strict 4-level priority stack:
// Level 1: Staff / Admin Hard Lock (attentionLock)
// Level 2: Active Chat Item / Viewer Bounty Trigger (itemOverride with TTL)
// Level 3: Operator Active Mode (SubjectMode: group, animals, speaker, etc.)
// Level 4: Autonomous Scorer / Ambient Round-Robin Fallback
// ─────────────────────────────────────────────────────────────────────────────

import type { SubjectMode } from "./directorVirtualAtlas";
import type { DirectorAttentionLock } from "../director/directorMetrics";

export type DirectorItemOverride = {
  active: boolean;
  itemSlug: string;
  itemName: string;
  targetMode?: SubjectMode;
  targetCameraId?: string;
  targetRoomKey?: string;
  triggeredBy: string;
  startedAt: number;
  expiresAt: number;
  durationSeconds: number;
};

export type DirectorPolicyDecision = {
  effectiveMode: SubjectMode;
  activeOverrideType: "ADMIN_LOCK" | "ITEM_OVERRIDE" | "OPERATOR_MODE" | "AUTO_HEURISTIC";
  activeOverrideReason: string;
  timeRemainingSeconds?: number;
  targetCameraId?: string;
  targetRoomKey?: string;
};

// Global in-memory item override state
let g_activeItemOverride: DirectorItemOverride | null = null;

/**
 * Applies a time-bound item override onto the Director (e.g. Cat Laser, Room Spotlight, Mutiny).
 */
export function applyDirectorItemOverride(params: {
  itemSlug: string;
  itemName: string;
  targetMode?: SubjectMode;
  targetCameraId?: string;
  targetRoomKey?: string;
  triggeredBy: string;
  durationSeconds?: number;
  now?: number;
}): DirectorItemOverride {
  const now = params.now ?? Date.now();
  const duration = params.durationSeconds ?? 45;
  const expiresAt = now + duration * 1000;

  const override: DirectorItemOverride = {
    active: true,
    itemSlug: params.itemSlug,
    itemName: params.itemName,
    targetMode: params.targetMode,
    targetCameraId: params.targetCameraId,
    targetRoomKey: params.targetRoomKey,
    triggeredBy: params.triggeredBy,
    startedAt: now,
    expiresAt,
    durationSeconds: duration,
  };

  g_activeItemOverride = override;
  return override;
}

/**
 * Retrieves the currently active item override, checking for expiration.
 */
export function getActiveItemOverride(now = Date.now()): DirectorItemOverride | null {
  if (!g_activeItemOverride || !g_activeItemOverride.active) return null;
  if (now >= g_activeItemOverride.expiresAt) {
    g_activeItemOverride = null;
    return null;
  }
  return g_activeItemOverride;
}

/**
 * Explicitly clears the active item override.
 */
export function clearItemOverride(): void {
  g_activeItemOverride = null;
}

/**
 * Resolves the effective Director mode and active target according to the 4-tier hierarchy.
 */
export function resolveEffectiveDirectorDecision(params: {
  attentionLock?: DirectorAttentionLock | null;
  itemOverride?: DirectorItemOverride | null;
  operatorMode?: SubjectMode | null;
  suggestedMode?: SubjectMode | null;
  now?: number;
}): DirectorPolicyDecision {
  const now = params.now ?? Date.now();

  // ── LEVEL 1: Admin / Staff Hard Attention Lock ──
  const lock = params.attentionLock;
  if (lock && lock.active) {
    const isExpired = lock.expiresAt !== null && now > lock.expiresAt;
    if (!isExpired) {
      const remaining =
        lock.expiresAt !== null ? Math.max(0, Math.floor((lock.expiresAt - now) / 1000)) : undefined;
      return {
        effectiveMode: "manual",
        activeOverrideType: "ADMIN_LOCK",
        activeOverrideReason: `Staff Hold by ${lock.lockedBy} (${lock.targetLabel})`,
        timeRemainingSeconds: remaining,
        targetCameraId: lock.targetType === "camera" ? lock.targetId : undefined,
        targetRoomKey: lock.targetType === "room" ? lock.targetId : undefined,
      };
    }
  }

  // ── LEVEL 2: Active Chat Item / Viewer Bounty Override ──
  const item = params.itemOverride ?? getActiveItemOverride(now);
  if (item && item.active && now < item.expiresAt) {
    const remaining = Math.max(0, Math.floor((item.expiresAt - now) / 1000));
    return {
      effectiveMode: item.targetMode ?? "auto",
      activeOverrideType: "ITEM_OVERRIDE",
      activeOverrideReason: `Item Trigger: ${item.itemName} used by @${item.triggeredBy}`,
      timeRemainingSeconds: remaining,
      targetCameraId: item.targetCameraId,
      targetRoomKey: item.targetRoomKey,
    };
  }

  // ── LEVEL 3: Operator Selected Mode ──
  if (params.operatorMode) {
    return {
      effectiveMode: params.operatorMode,
      activeOverrideType: "OPERATOR_MODE",
      activeOverrideReason: `Operator Selected [${params.operatorMode.toUpperCase()}] Mode`,
    };
  }

  // ── LEVEL 4: Autonomous Scorer / Ambient Round-Robin Fallback ──
  const effectiveMode = params.suggestedMode ?? "auto";
  return {
    effectiveMode,
    activeOverrideType: "AUTO_HEURISTIC",
    activeOverrideReason: `Autonomous Scorer [${effectiveMode.toUpperCase()}]`,
  };
}
