// src/zones/tank/server/interactiveTargetDetector.ts
// ─────────────────────────────────────────────────────────────────────────────
// Interactive Camera Object & Clutter Scavenger Engine ("Where's Waldo" Tap)
//
// Manages normalized spatial bounding boxes ([xMin, yMin, xMax, yMax] scaled 0.0-1.0)
// for object detection, room clutter, trash, and scavenger hunt bounties.
// ─────────────────────────────────────────────────────────────────────────────

export type BoundingBox = {
  xMin: number; // 0.000 to 1.000 (Normalized Left)
  yMin: number; // 0.000 to 1.000 (Normalized Top)
  xMax: number; // 0.000 to 1.000 (Normalized Right)
  yMax: number; // 0.000 to 1.000 (Normalized Bottom)
};

export type InteractiveTargetKind = "trash" | "clutter" | "easter_egg" | "toy" | "waldo";

export type InteractiveTarget = {
  id: string;
  camSlug: string;
  roomKey: string;
  roomTitle: string;
  label: string; // e.g. "Discarded Soda Can", "Lost VR Controller", "Golden Trophy"
  kind: InteractiveTargetKind;
  box: BoundingBox;
  xpReward: number;
  tokenReward: number;
  maxClaimsPerUser: number;
  totalClaimCap?: number;
  active: boolean;
  createdAt: number;
  expiresAt: number;
};

// Preset catalog of house clutter, trash, and hidden objects
export const PRESET_CLUTTER_TARGETS: Omit<InteractiveTarget, "id" | "createdAt" | "expiresAt">[] = [
  {
    camSlug: "living-room",
    roomKey: "living-room",
    roomTitle: "Living Room",
    label: "Crushed Energy Drink Can",
    kind: "trash",
    box: { xMin: 0.15, yMin: 0.65, xMax: 0.35, yMax: 0.85 },
    xpReward: 25,
    tokenReward: 15,
    maxClaimsPerUser: 3,
    active: true,
  },
  {
    camSlug: "living-room",
    roomKey: "living-room",
    roomTitle: "Living Room",
    label: "Lost VR Headset Strap",
    kind: "clutter",
    box: { xMin: 0.60, yMin: 0.40, xMax: 0.80, yMax: 0.60 },
    xpReward: 35,
    tokenReward: 20,
    maxClaimsPerUser: 3,
    active: true,
  },
  {
    camSlug: "kitchen",
    roomKey: "kitchen",
    roomTitle: "Kitchen",
    label: "Forgotten Pizza Box",
    kind: "trash",
    box: { xMin: 0.20, yMin: 0.50, xMax: 0.45, yMax: 0.75 },
    xpReward: 30,
    tokenReward: 15,
    maxClaimsPerUser: 3,
    active: true,
  },
  {
    camSlug: "kitchen",
    roomKey: "kitchen",
    roomTitle: "Kitchen",
    label: "Golden Coffee Mug",
    kind: "easter_egg",
    box: { xMin: 0.55, yMin: 0.35, xMax: 0.75, yMax: 0.55 },
    xpReward: 50,
    tokenReward: 30,
    maxClaimsPerUser: 3,
    active: true,
  },
  {
    camSlug: "game-room",
    roomKey: "game-room",
    roomTitle: "Game Room",
    label: "Fallen Arcade Joystick",
    kind: "clutter",
    box: { xMin: 0.70, yMin: 0.55, xMax: 0.90, yMax: 0.75 },
    xpReward: 40,
    tokenReward: 25,
    maxClaimsPerUser: 3,
    active: true,
  },
  {
    camSlug: "director",
    roomKey: "director",
    roomTitle: "Director Cut",
    label: "Suspicious Control Wire",
    kind: "waldo",
    box: { xMin: 0.40, yMin: 0.70, xMax: 0.60, yMax: 0.90 },
    xpReward: 60,
    tokenReward: 40,
    maxClaimsPerUser: 3,
    active: true,
  },
];

// In-memory active target store & user claim registry
const activeTargetsMap = new Map<string, InteractiveTarget>();
// Key: `${userId}:${targetId}` -> claimCount
const userClaimsMap = new Map<string, number>();

/**
 * Initializes default targets if none are active
 */
export function ensureDefaultTargetsActive() {
  const now = Date.now();
  // Clear expired targets
  for (const [id, target] of activeTargetsMap.entries()) {
    if (now > target.expiresAt) {
      activeTargetsMap.delete(id);
    }
  }

  if (activeTargetsMap.size === 0) {
    for (const preset of PRESET_CLUTTER_TARGETS) {
      const id = `target_${preset.roomKey}_${preset.kind}_${Date.now()}`;
      activeTargetsMap.set(id, {
        ...preset,
        id,
        createdAt: now,
        expiresAt: now + 4 * 60 * 60 * 1000, // 4 hours active
      });
    }
  }
}

/**
 * Lists all active targets (optionally filtered by camera/room)
 */
export function getActiveTargets(camSlug?: string): InteractiveTarget[] {
  ensureDefaultTargetsActive();
  const now = Date.now();
  const targets = Array.from(activeTargetsMap.values()).filter((t) => t.active && now <= t.expiresAt);
  if (!camSlug) return targets;
  return targets.filter((t) => t.camSlug === camSlug || t.roomKey === camSlug);
}

/**
 * Spawns a new custom interactive target (Director action)
 */
export function spawnInteractiveTarget(params: {
  camSlug: string;
  roomKey: string;
  roomTitle: string;
  label: string;
  kind?: InteractiveTargetKind;
  box: BoundingBox;
  xpReward?: number;
  tokenReward?: number;
  maxClaimsPerUser?: number;
  durationMinutes?: number;
}): InteractiveTarget {
  const now = Date.now();
  const id = `target_${params.roomKey}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const durationMs = (params.durationMinutes ?? 60) * 60 * 1000;

  const target: InteractiveTarget = {
    id,
    camSlug: params.camSlug,
    roomKey: params.roomKey,
    roomTitle: params.roomTitle,
    label: params.label,
    kind: params.kind ?? "clutter",
    box: params.box,
    xpReward: params.xpReward ?? 30,
    tokenReward: params.tokenReward ?? 20,
    maxClaimsPerUser: params.maxClaimsPerUser ?? 3,
    active: true,
    createdAt: now,
    expiresAt: now + durationMs,
  };

  activeTargetsMap.set(id, target);
  return target;
}

/**
 * Sub-millisecond normalized bounding box hit test
 */
export function evaluateTapHitTest(
  camSlug: string,
  nx: number,
  ny: number,
): InteractiveTarget | null {
  const targets = getActiveTargets(camSlug);
  for (const target of targets) {
    const { xMin, yMin, xMax, yMax } = target.box;
    if (nx >= xMin && nx <= xMax && ny >= yMin && ny <= yMax) {
      return target;
    }
  }
  return null;
}

/**
 * Checks and records user claim quota
 */
export function recordUserTargetClaim(
  userId: string,
  targetId: string,
  maxAllowed: number,
): { allowed: boolean; currentClaims: number } {
  const key = `${userId}:${targetId}`;
  const current = userClaimsMap.get(key) || 0;
  if (current >= maxAllowed) {
    return { allowed: false, currentClaims: current };
  }
  const next = current + 1;
  userClaimsMap.set(key, next);
  return { allowed: true, currentClaims: next };
}
