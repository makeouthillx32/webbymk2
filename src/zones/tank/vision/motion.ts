// src/zones/tank/vision/motion.ts
// ─────────────────────────────────────────────────────────────────────────────
// Frame-to-frame box matching: the cheapest possible tracker.
//
// A detector is stateless — it reports what is in THIS frame and has no notion
// that the person on the left is the same person who was on the left a second
// ago. Velocity and "is this thing moving" come from comparing consecutive
// frames, which means someone has to hold the previous frame's boxes.
//
// Extracted from PeopleDetectionEngine alongside the decoder so the browser and
// the server-side observer compute movement the same way. Nearest-centre
// matching within a radius is genuinely crude — it cannot survive two subjects
// crossing, and it is not identity. It is honest about being a motion estimate,
// and the per-individual matching that would make it real is the
// `referenceImages` seam in detectionCatalog.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalizedDetection } from "./decode";

/** Past this normalized distance, two boxes are not treated as the same thing. */
export const MATCH_RADIUS = 0.25;
/** Normalized frame units per second above which a subject counts as moving. */
export const MOVEMENT_THRESHOLD = 0.03;

export type TrackedBox = NormalizedDetection & {
  velocity: number;
  isMovement: boolean;
};

export type PriorBox = { nx: number; ny: number; time: number };

/**
 * Attaches velocity and a movement flag by matching each box to the nearest
 * prior box within MATCH_RADIUS.
 *
 * Returns both the annotated boxes and the priors to carry into the next frame,
 * so the caller holds no matching logic of its own.
 */
export function trackMotion(
  boxes: NormalizedDetection[],
  priors: PriorBox[],
  now: number,
): { boxes: TrackedBox[]; nextPriors: PriorBox[] } {
  const tracked = boxes.map((box) => {
    let minDistance = Number.POSITIVE_INFINITY;
    let matched: PriorBox | null = null;
    for (const prior of priors) {
      const distance = Math.hypot(box.nx - prior.nx, box.ny - prior.ny);
      if (distance < minDistance && distance < MATCH_RADIUS) {
        minDistance = distance;
        matched = prior;
      }
    }

    let velocity = 0;
    let isMovement = false;
    if (matched && matched.time > 0) {
      // Floor the interval: a tick that fired twice in quick succession would
      // otherwise divide by near-zero and report an absurd velocity.
      const dtSeconds = Math.max(0.1, (now - matched.time) / 1000);
      velocity = Number((minDistance / dtSeconds).toFixed(3));
      isMovement = velocity >= MOVEMENT_THRESHOLD;
    }

    return { ...box, velocity, isMovement };
  });

  return {
    boxes: tracked,
    nextPriors: tracked.map((b) => ({ nx: b.nx, ny: b.ny, time: now })),
  };
}
