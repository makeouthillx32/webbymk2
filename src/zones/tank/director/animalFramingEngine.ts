// src/zones/tank/director/animalFramingEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Autonomous AI PTZ Animal & Pet Framing Engine
//
// Detects dogs, cats, and enrolled house animals (Buster, Kona, Mochi, Shadow),
// computes tight individual or compound pet group framing,
// and applies subtle lens calibration bobbing during settling.
// ─────────────────────────────────────────────────────────────────────────────

import type { VirtualPtzState } from "../director-configuration/components/NavigationController";
import { matchEnrolledAnimal, type HouseAnimal } from "../server/houseAnimals";

export const CANVAS_WIDTH = 3840;
export const CANVAS_HEIGHT = 2160;
export const MAX_ANIMAL_ZOOM = 3.2;
export const MIN_ANIMAL_ZOOM = 1.0;
export const ANIMAL_PADDING_MULTIPLIER = 1.35;

export type AnimalDetectionBox = {
  nx: number; // 0.0 to 1.0
  ny: number; // 0.0 to 1.0
  nw: number; // 0.0 to 1.0
  nh: number; // 0.0 to 1.0
  label?: string; // e.g. "dog", "cat", "pet", "Buster", "Mochi"
  confidence?: number;
  identifiedAnimal?: HouseAnimal | null;
};

export type AnimalFramingState = {
  currentPtz: VirtualPtzState;
  targetPtz: VirtualPtzState;
  animalCenter: { x: number; y: number };
  animalBounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  detectedAnimals: AnimalDetectionBox[];
  animalCount: number;
  framingType: "SOLO_PET" | "PET_CLUSTER" | "WIDE";
  settlingProgress: number;
  lastAdjustedAt: number;
  calibrationPhase: "WIDE" | "CONVERGING" | "BOBBING_CALIBRATION" | "LOCKED";
};

export const DEFAULT_ANIMAL_FRAMING_STATE: AnimalFramingState = {
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
  animalCenter: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
  animalBounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
  detectedAnimals: [],
  animalCount: 0,
  framingType: "WIDE",
  settlingProgress: 1.0,
  lastAdjustedAt: 0,
  calibrationPhase: "WIDE",
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Calculates target PTZ coordinates for solo or cluster of animals.
 */
export function calculateAnimalPtzTarget(
  animals: AnimalDetectionBox[]
): {
  targetPtz: VirtualPtzState;
  animalCenter: { x: number; y: number };
  animalBounds: { xMin: number; yMin: number; xMax: number; yMax: number };
  framingType: "SOLO_PET" | "PET_CLUSTER" | "WIDE";
} {
  if (animals.length === 0) {
    return {
      targetPtz: {
        zoomFactor: 1.0,
        panOffsetX: 0,
        panOffsetY: 0,
        zoomSpeed: 5,
      },
      animalCenter: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 },
      animalBounds: { xMin: 0, yMin: 0, xMax: 1, yMax: 1 },
      framingType: "WIDE",
    };
  }

  // 1. Calculate Compound Enclosing Bounding Box for Animals
  let xMin = 1.0;
  let yMin = 1.0;
  let xMax = 0.0;
  let yMax = 0.0;

  for (const a of animals) {
    if (a.nx < xMin) xMin = a.nx;
    if (a.ny < yMin) yMin = a.ny;
    const right = a.nx + a.nw;
    const bottom = a.ny + a.nh;
    if (right > xMax) xMax = right;
    if (bottom > yMax) yMax = bottom;
  }

  xMin = clamp(xMin, 0, 1);
  yMin = clamp(yMin, 0, 1);
  xMax = clamp(xMax, 0, 1);
  yMax = clamp(yMax, 0, 1);

  const spanW = Math.max(0.06, xMax - xMin);
  const spanH = Math.max(0.06, yMax - yMin);

  // 2. Calculate Center Coordinates in Canvas Space
  const centerX = ((xMin + xMax) / 2) * CANVAS_WIDTH;
  const centerY = ((yMin + yMax) / 2) * CANVAS_HEIGHT;

  // 3. Optimize Zoom: Solo Pet (tighter) vs Pet Cluster
  const maxSpan = Math.max(spanW, spanH);
  const targetZoomRaw = 1.0 / (maxSpan * ANIMAL_PADDING_MULTIPLIER);
  const targetZoom = clamp(targetZoomRaw, MIN_ANIMAL_ZOOM, MAX_ANIMAL_ZOOM);

  // 4. Calculate Pan Offsets & Clamp to Canvas Bounds
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
    animalCenter: { x: Math.round(centerX), y: Math.round(centerY) },
    animalBounds: { xMin, yMin, xMax, yMax },
    framingType: animals.length === 1 ? "SOLO_PET" : "PET_CLUSTER",
  };
}

/**
 * Steps the Animal Framing Engine forward in time.
 */
export function stepAnimalFramingEngine(
  state: AnimalFramingState,
  rawBoxes: Array<{ nx: number; ny: number; nw: number; nh: number; label?: string; confidence?: number }>,
  now = Date.now(),
  deltaSeconds = 0.08
): AnimalFramingState {
  // Filter for animal-related boxes
  const animals: AnimalDetectionBox[] = rawBoxes
    .filter((b) => {
      const l = (b.label || "").toLowerCase();
      return (
        l === "dog" ||
        l === "cat" ||
        l === "pet" ||
        l === "animal" ||
        l === "buster" ||
        l === "kona" ||
        l === "mochi" ||
        l === "shadow"
      );
    })
    .map((b) => ({
      ...b,
      identifiedAnimal: matchEnrolledAnimal(b.label),
    }));

  const { targetPtz, animalCenter, animalBounds, framingType } = calculateAnimalPtzTarget(animals);

  const zoomDelta = Math.abs(targetPtz.zoomFactor - state.targetPtz.zoomFactor);
  const panDelta =
    Math.hypot(targetPtz.panOffsetX - state.targetPtz.panOffsetX, targetPtz.panOffsetY - state.targetPtz.panOffsetY);

  const isTargetChanged = zoomDelta > 0.05 || panDelta > 40 || animals.length !== state.animalCount;
  const lastAdjustedAt = isTargetChanged ? now : state.lastAdjustedAt;

  // Gliding lerp
  const panLerpSpeed = 4.5 * deltaSeconds;
  const zoomLerpSpeed = 3.5 * deltaSeconds;

  let nextPanX = state.currentPtz.panOffsetX + (targetPtz.panOffsetX - state.currentPtz.panOffsetX) * panLerpSpeed;
  let nextPanY = state.currentPtz.panOffsetY + (targetPtz.panOffsetY - state.currentPtz.panOffsetY) * panLerpSpeed;
  let nextZoom = state.currentPtz.zoomFactor + (targetPtz.zoomFactor - state.currentPtz.zoomFactor) * zoomLerpSpeed;

  const timeSinceAdjust = now - lastAdjustedAt;
  const isSettling = timeSinceAdjust < 1600;
  const settlingProgress = clamp(timeSinceAdjust / 1600, 0, 1);

  let phase: AnimalFramingState["calibrationPhase"] = "LOCKED";

  if (animals.length === 0 || targetPtz.zoomFactor <= 1.05) {
    phase = "WIDE";
  } else if (!isSettling) {
    phase = "LOCKED";
  } else if (timeSinceAdjust < 600) {
    phase = "CONVERGING";
  } else {
    phase = "BOBBING_CALIBRATION";
    const bobFreq = 5.5;
    const bobDecay = 1.0 - (timeSinceAdjust - 600) / 1000;
    const bobOffset = Math.sin((timeSinceAdjust / 1000) * bobFreq * Math.PI * 2) * 0.025 * Math.max(0, bobDecay);
    nextZoom = clamp(nextZoom + bobOffset, MIN_ANIMAL_ZOOM, MAX_ANIMAL_ZOOM);
  }

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
    animalCenter,
    animalBounds,
    detectedAnimals: animals,
    animalCount: animals.length,
    framingType,
    settlingProgress: parseFloat(settlingProgress.toFixed(2)),
    lastAdjustedAt,
    calibrationPhase: phase,
  };
}
