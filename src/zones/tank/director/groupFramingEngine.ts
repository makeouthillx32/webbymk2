// src/zones/tank/director/groupFramingEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Autonomous AI PTZ Group Framing & Calibration Engine
//
// Computes tight enclosing bounding boxes around all detected group members,
// optimizes virtual PTZ zoom (1.0x to 3.5x) with safety margin padding,
// and applies subtle organic calibration gestures (lens bobbing / breathing).
// ─────────────────────────────────────────────────────────────────────────────

import type { VirtualPtzState } from "../director-configuration/components/NavigationController";

export const CANVAS_WIDTH = 3840;
export const CANVAS_HEIGHT = 2160;
export const MAX_GROUP_ZOOM = 3.5;
export const MIN_GROUP_ZOOM = 1.0;
export const GROUP_PADDING_MULTIPLIER = 1.30;

export type GroupMemberBox = {
  nx: number; // 0.0 to 1.0
  ny: number; // 0.0 to 1.0
  nw: number; // 0.0 to 1.0
  nh: number; // 0.0 to 1.0
  label?: string;
};

export type GroupFramingState = {
  currentPtz: VirtualPtzState;
  targetPtz: VirtualPtzState;
  groupCenter: { x: number; y: number };
  groupBounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  memberCount: number;
  settlingProgress: number; // 0.0 to 1.0
  lastAdjustedAt: number;
  calibrationPhase: "WIDE" | "CONVERGING" | "BOBBING_CALIBRATION" | "LOCKED";
};

export const DEFAULT_GROUP_FRAMING_STATE: GroupFramingState = {
  currentPtz: {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
  },
  targetPtz: {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: 5,
  },
  groupCenter: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
  groupBounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
  memberCount: 0,
  settlingProgress: 1.0,
  lastAdjustedAt: 0,
  calibrationPhase: "WIDE",
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes enclosing compound bounding box and target PTZ for a set of group members.
 */
export function calculateGroupPtzTarget(
  members: GroupMemberBox[]
): {
  targetPtz: VirtualPtzState;
  groupCenter: { x: number; y: number };
  groupBounds: { xMin: number; yMin: number; xMax: number; yMax: number };
} {
  if (members.length === 0) {
    return {
      targetPtz: {
        zoomFactor: 1.0,
        panOffsetX: 0,
        panOffsetY: 0,
        zoomSpeed: 5,
      },
      groupCenter: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      groupBounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
    };
  }

  // 1. Calculate Compound Enclosing Bounding Box
  let xMin = 1.0;
  let yMin = 1.0;
  let xMax = 0.0;
  let yMax = 0.0;

  for (const m of members) {
    if (m.nx < xMin) xMin = m.nx;
    if (m.ny < yMin) yMin = m.ny;
    const right = m.nx + m.nw;
    const bottom = m.ny + m.nh;
    if (right > xMax) xMax = right;
    if (bottom > yMax) yMax = bottom;
  }

  xMin = clamp(xMin, 0, 1);
  yMin = clamp(yMin, 0, 1);
  xMax = clamp(xMax, 0, 1);
  yMax = clamp(yMax, 0, 1);

  const groupWidth = Math.max(0.08, xMax - xMin);
  const groupHeight = Math.max(0.08, yMax - yMin);

  // 2. Calculate Group Center in Canvas Space
  const centerX = ((xMin + xMax) / 2) * CANVAS_WIDTH;
  const centerY = ((yMin + yMax) / 2) * CANVAS_HEIGHT;

  // 3. Optimize Zoom Factor to frame entire group with safety padding
  const maxSpan = Math.max(groupWidth, groupHeight);
  const targetZoomRaw = 1.0 / (maxSpan * GROUP_PADDING_MULTIPLIER);
  const targetZoom = clamp(targetZoomRaw, MIN_GROUP_ZOOM, MAX_GROUP_ZOOM);

  // 4. Calculate Pan Offsets & Clamp to 3840x2160 Canvas Bounds
  const cropW = CANVAS_WIDTH / targetZoom;
  const cropH = CANVAS_HEIGHT / targetZoom;

  const panOffsetX = clamp(centerX - cropW / 2, 0, CANVAS_WIDTH - cropW);
  const panOffsetY = clamp(centerY - cropH / 2, 0, CANVAS_HEIGHT - cropH);

  return {
    targetPtz: {
      zoomFactor: parseFloat(targetZoom.toFixed(2)),
      panOffsetX: Math.round(panOffsetX),
      panOffsetY: Math.round(panOffsetY),
      zoomSpeed: 5,
    },
    groupCenter: { x: Math.round(centerX), y: Math.round(centerY) },
    groupBounds: { xMin, yMin, xMax, yMax },
  };
}

/**
 * Steps the Group Framing Engine forward in time.
 * Smooths pan/zoom and applies subtle calibration bobbing while settling.
 */
export function stepGroupFramingEngine(
  state: GroupFramingState,
  members: GroupMemberBox[],
  now = Date.now(),
  deltaSeconds = 0.08
): GroupFramingState {
  const { targetPtz, groupCenter, groupBounds } = calculateGroupPtzTarget(members);

  // Check if target changed significantly
  const zoomDelta = Math.abs(targetPtz.zoomFactor - state.targetPtz.zoomFactor);
  const panDelta =
    Math.hypot(targetPtz.panOffsetX - state.targetPtz.panOffsetX, targetPtz.panOffsetY - state.targetPtz.panOffsetY);

  const isTargetChanged = zoomDelta > 0.05 || panDelta > 40 || members.length !== state.memberCount;
  const lastAdjustedAt = isTargetChanged ? now : state.lastAdjustedAt;

  // Lerp Smoothing Factors
  const panLerpSpeed = 4.5 * deltaSeconds; // Smooth gliding pan
  const zoomLerpSpeed = 3.5 * deltaSeconds;

  let nextPanX = state.currentPtz.panOffsetX + (targetPtz.panOffsetX - state.currentPtz.panOffsetX) * panLerpSpeed;
  let nextPanY = state.currentPtz.panOffsetY + (targetPtz.panOffsetY - state.currentPtz.panOffsetY) * panLerpSpeed;
  let nextZoom = state.currentPtz.zoomFactor + (targetPtz.zoomFactor - state.currentPtz.zoomFactor) * zoomLerpSpeed;

  const timeSinceAdjust = now - lastAdjustedAt;
  const isSettling = timeSinceAdjust < 1600;
  const settlingProgress = clamp(timeSinceAdjust / 1600, 0, 1);

  let phase: GroupFramingState["calibrationPhase"] = "LOCKED";

  if (members.length === 0 || targetPtz.zoomFactor <= 1.05) {
    phase = "WIDE";
  } else if (!isSettling) {
    phase = "LOCKED";
  } else if (timeSinceAdjust < 600) {
    phase = "CONVERGING";
  } else {
    phase = "BOBBING_CALIBRATION";
    // Subtle cinematic lens bobbing/breathing gesture (+/- 0.025x zoom pulse decaying as it locks)
    const bobFreq = 6.0; // Oscillations per second
    const bobDecay = 1.0 - (timeSinceAdjust - 600) / 1000; // 1.0 -> 0.0
    const bobOffset = Math.sin((timeSinceAdjust / 1000) * bobFreq * Math.PI * 2) * 0.025 * Math.max(0, bobDecay);
    nextZoom = clamp(nextZoom + bobOffset, MIN_GROUP_ZOOM, MAX_GROUP_ZOOM);
  }

  // Final canvas safety clamping
  const finalZoom = parseFloat(nextZoom.toFixed(3));
  const finalCropW = CANVAS_WIDTH / finalZoom;
  const finalCropH = CANVAS_HEIGHT / finalZoom;
  const finalPanX = Math.round(clamp(nextPanX, 0, CANVAS_WIDTH - finalCropW));
  const finalPanY = Math.round(clamp(nextPanY, 0, CANVAS_HEIGHT - finalCropH));

  return {
    currentPtz: {
      zoomFactor: finalZoom,
      panOffsetX: finalPanX,
      panOffsetY: finalPanY,
      zoomSpeed: 5,
    },
    targetPtz,
    groupCenter,
    groupBounds,
    memberCount: members.length,
    settlingProgress: parseFloat(settlingProgress.toFixed(2)),
    lastAdjustedAt,
    calibrationPhase: phase,
  };
}
