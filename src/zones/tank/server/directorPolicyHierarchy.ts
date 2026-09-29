// src/zones/tank/server/directorPolicyHierarchy.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hardened Director Policy Hierarchy & Decoupled Chaos Orchestration Engine
//
// Resolves director decisions across a strict 4-level priority stack:
// Level 1: Staff / Admin Hard Lock (attentionLock)
// Level 2: Active Chaos Items / Viewer Bounties (decoupled room, detection, framing, chaos hop)
// Level 3: Operator Active Mode & Local Room Lock
// Level 4: Autonomous Scorer / Ambient Round-Robin Fallback
//
// Architecture:
// All capability layers (Room Selection, Detection Style, Framing Mode, Kinematics)
// are independently decoupled so items can knock individual layers off their rocker,
// yet are unified in runtime orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SubjectMode, FramingMode } from "./directorVirtualAtlas";
import type { DirectorAttentionLock } from "../director/directorMetrics";
import {
  CHAOS_DIRECTOR_CATALOG,
  type TrackingSpeed,
  type DirectorItemOverride,
  type DecoupledDirectorPolicy,
  type DirectorPolicyDecision,
  type ChaosDirectorItemDefinition,
} from "../director/chaosDirectorCatalog";

export {
  CHAOS_DIRECTOR_CATALOG,
  type TrackingSpeed,
  type DirectorItemOverride,
  type DecoupledDirectorPolicy,
  type DirectorPolicyDecision,
  type ChaosDirectorItemDefinition,
};

// In-memory active items store
let g_activeItemOverrides: DirectorItemOverride[] = [];

/**
 * Applies a decoupled or compound item override onto the Director.
 */
export function applyDirectorItemOverride(params: {
  itemSlug: string;
  itemName: string;
  targetMode?: SubjectMode;
  targetDetectionMode?: SubjectMode;
  targetFramingMode?: FramingMode;
  targetRoomKey?: string;
  targetCameraId?: string;
  targetSpeed?: TrackingSpeed;
  chaosHopIntervalMs?: number;
  overrideRoomLock?: boolean;
  triggeredBy: string;
  durationSeconds?: number;
  now?: number;
}): DirectorItemOverride {
  const now = params.now ?? Date.now();
  const duration = params.durationSeconds ?? 45;
  const expiresAt = now + duration * 1000;
  const targetMode = params.targetDetectionMode ?? params.targetMode;

  const override: DirectorItemOverride = {
    id: `item-${params.itemSlug}-${now}-${Math.random().toString(36).slice(2, 6)}`,
    active: true,
    itemSlug: params.itemSlug,
    itemName: params.itemName,
    targetMode,
    targetDetectionMode: targetMode,
    targetFramingMode: params.targetFramingMode,
    targetRoomKey: params.targetRoomKey,
    targetCameraId: params.targetCameraId,
    targetSpeed: params.targetSpeed,
    chaosHopIntervalMs: params.chaosHopIntervalMs,
    overrideRoomLock: params.overrideRoomLock,
    triggeredBy: params.triggeredBy,
    startedAt: now,
    expiresAt,
    durationSeconds: duration,
  };

  // Remove any stale overrides of the exact same slug
  g_activeItemOverrides = g_activeItemOverrides.filter(
    (o) => o.expiresAt > now && o.itemSlug !== params.itemSlug
  );
  g_activeItemOverrides.push(override);

  return override;
}

/**
 * Triggers a pre-configured item from the Chaos Director Catalog.
 */
export function triggerChaosCatalogItem(
  slug: string,
  options?: {
    targetRoomKey?: string;
    targetCameraId?: string;
    triggeredBy?: string;
    durationSeconds?: number;
    now?: number;
  }
): DirectorItemOverride | null {
  const def = CHAOS_DIRECTOR_CATALOG.find((item) => item.slug === slug);
  if (!def) return null;

  return applyDirectorItemOverride({
    itemSlug: def.slug,
    itemName: def.name,
    targetDetectionMode: def.targetDetectionMode,
    targetFramingMode: def.targetFramingMode,
    targetRoomKey: options?.targetRoomKey ?? def.targetRoomKey,
    targetCameraId: options?.targetCameraId,
    targetSpeed: def.targetSpeed,
    chaosHopIntervalMs: def.chaosHopIntervalMs,
    overrideRoomLock: def.overrideRoomLock,
    triggeredBy: options?.triggeredBy ?? "Viewer",
    durationSeconds: options?.durationSeconds ?? def.defaultDurationSeconds,
    now: options?.now,
  });
}

/**
 * Retrieves all currently active item overrides.
 */
export function getActiveItemOverrides(now = Date.now()): DirectorItemOverride[] {
  g_activeItemOverrides = g_activeItemOverrides.filter((o) => o.active && now < o.expiresAt);
  return [...g_activeItemOverrides];
}

/**
 * Backwards-compatible single active item retriever (returns highest-priority/most recent item).
 */
export function getActiveItemOverride(now = Date.now()): DirectorItemOverride | null {
  const active = getActiveItemOverrides(now);
  return active.length > 0 ? active[active.length - 1] : null;
}

/**
 * Computes the merged decoupled policy across all active item overrides.
 */
export function getActiveDecoupledPolicy(now = Date.now()): DecoupledDirectorPolicy {
  const active = getActiveItemOverrides(now);
  if (active.length === 0) {
    return {
      hasActiveOverride: false,
      activeOverrides: [],
      effectiveDetectionMode: null,
      effectiveFramingMode: null,
      effectiveRoomKey: null,
      effectiveCameraId: null,
      effectiveSpeed: null,
      chaosHopIntervalMs: null,
      overrideRoomLock: false,
      timeRemainingSeconds: 0,
      reason: "No active item overrides",
    };
  }

  // Aggregate across active items (later items take precedence for conflicting slots)
  let detectionMode: SubjectMode | null = null;
  let framingMode: FramingMode | null = null;
  let roomKey: string | null = null;
  let cameraId: string | null = null;
  let speed: TrackingSpeed | null = null;
  let chaosHopIntervalMs: number | null = null;
  let overrideRoomLock = false;
  let maxExpiresAt = 0;

  const names: string[] = [];

  for (const item of active) {
    if (item.targetDetectionMode || item.targetMode) {
      detectionMode = (item.targetDetectionMode ?? item.targetMode) as SubjectMode;
    }
    if (item.targetFramingMode) {
      framingMode = item.targetFramingMode;
    }
    if (item.targetRoomKey) {
      roomKey = item.targetRoomKey;
    }
    if (item.targetCameraId) {
      cameraId = item.targetCameraId;
    }
    if (item.targetSpeed) {
      speed = item.targetSpeed;
    }
    if (item.chaosHopIntervalMs) {
      chaosHopIntervalMs = item.chaosHopIntervalMs;
    }
    if (item.overrideRoomLock) {
      overrideRoomLock = true;
    }
    maxExpiresAt = Math.max(maxExpiresAt, item.expiresAt);
    names.push(`${item.itemName} (@${item.triggeredBy})`);
  }

  const timeRemainingSeconds = Math.max(0, Math.floor((maxExpiresAt - now) / 1000));

  return {
    hasActiveOverride: true,
    activeOverrides: active,
    effectiveDetectionMode: detectionMode,
    effectiveFramingMode: framingMode,
    effectiveRoomKey: roomKey,
    effectiveCameraId: cameraId,
    effectiveSpeed: speed,
    chaosHopIntervalMs,
    overrideRoomLock,
    timeRemainingSeconds,
    reason: `Active Items: ${names.join(", ")}`,
  };
}

/**
 * Clears all active item overrides.
 */
export function clearItemOverride(): void {
  g_activeItemOverrides = [];
}

/**
 * Resolves the effective Director decision according to the 4-tier hierarchy.
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

  // ── LEVEL 2: Active Chaos Items & Viewer Overrides ──
  const decoupledPolicy = getActiveDecoupledPolicy(now);
  const singleItem = params.itemOverride ?? (decoupledPolicy.hasActiveOverride ? decoupledPolicy.activeOverrides[decoupledPolicy.activeOverrides.length - 1] : null);

  if (singleItem && singleItem.active && now < singleItem.expiresAt) {
    const remaining = Math.max(0, Math.floor((singleItem.expiresAt - now) / 1000));
    return {
      effectiveMode: (singleItem.targetDetectionMode ?? singleItem.targetMode ?? decoupledPolicy.effectiveDetectionMode ?? "auto") as SubjectMode,
      activeOverrideType: "ITEM_OVERRIDE",
      activeOverrideReason: `Item Trigger: ${singleItem.itemName} used by @${singleItem.triggeredBy}`,
      timeRemainingSeconds: remaining,
      targetCameraId: singleItem.targetCameraId ?? decoupledPolicy.effectiveCameraId ?? undefined,
      targetRoomKey: singleItem.targetRoomKey ?? decoupledPolicy.effectiveRoomKey ?? undefined,
      targetFramingMode: singleItem.targetFramingMode ?? decoupledPolicy.effectiveFramingMode ?? undefined,
      targetSpeed: singleItem.targetSpeed ?? decoupledPolicy.effectiveSpeed ?? undefined,
      chaosHopIntervalMs: singleItem.chaosHopIntervalMs ?? decoupledPolicy.chaosHopIntervalMs ?? undefined,
      overrideRoomLock: singleItem.overrideRoomLock ?? decoupledPolicy.overrideRoomLock,
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
