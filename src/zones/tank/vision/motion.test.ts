import { describe, expect, test } from "bun:test";
import { MATCH_RADIUS, MOVEMENT_THRESHOLD, trackMotion, type PriorBox } from "./motion";
import type { NormalizedDetection } from "./decode";

const det = (nx: number, ny: number, label = "person"): NormalizedDetection => ({
  nx,
  ny,
  nw: 0.1,
  nh: 0.2,
  label,
  confidence: 0.9,
});

describe("trackMotion", () => {
  test("with no priors nothing is moving — a first frame cannot know", () => {
    const { boxes } = trackMotion([det(0.5, 0.5)], [], 1_000);
    expect(boxes[0].velocity).toBe(0);
    expect(boxes[0].isMovement).toBe(false);
  });

  test("a stationary subject reports zero velocity", () => {
    const priors: PriorBox[] = [{ nx: 0.5, ny: 0.5, time: 1_000 }];
    const { boxes } = trackMotion([det(0.5, 0.5)], priors, 2_000);
    expect(boxes[0].velocity).toBe(0);
    expect(boxes[0].isMovement).toBe(false);
  });

  test("a subject crossing the frame reports movement", () => {
    const priors: PriorBox[] = [{ nx: 0.3, ny: 0.5, time: 1_000 }];
    // 0.2 normalized units in 1s -> 0.2/s, well over the movement threshold
    // and still inside MATCH_RADIUS so the two frames are linked at all.
    const { boxes } = trackMotion([det(0.5, 0.5)], priors, 2_000);
    expect(boxes[0].velocity).toBeCloseTo(0.2, 3);
    expect(boxes[0].isMovement).toBe(true);
  });

  test("a subject moving faster than the match radius per tick is NOT tracked", () => {
    // A real blind spot, not a bug in the test: matching is positional, so
    // anything that travels more than MATCH_RADIUS between frames looks like a
    // different object and reports velocity 0 — the fastest motion is the
    // motion this tracker is least able to see. At the worker's default 1fps
    // capture that is roughly a quarter of the frame per second. Raising
    // TANK_VISION_CAPTURE_FPS shrinks the per-tick distance and narrows it.
    const priors: PriorBox[] = [{ nx: 0.1, ny: 0.5, time: 1_000 }];
    const { boxes } = trackMotion([det(0.5, 0.5)], priors, 2_000);
    expect(Math.abs(0.5 - 0.1)).toBeGreaterThan(MATCH_RADIUS);
    expect(boxes[0].velocity).toBe(0);
    expect(boxes[0].isMovement).toBe(false);
  });

  test("a drift under the threshold is not called movement", () => {
    const priors: PriorBox[] = [{ nx: 0.5, ny: 0.5, time: 1_000 }];
    // 0.02 units in 1s = 0.02/s, below MOVEMENT_THRESHOLD.
    const { boxes } = trackMotion([det(0.52, 0.5)], priors, 2_000);
    expect(boxes[0].velocity).toBeLessThan(MOVEMENT_THRESHOLD);
    expect(boxes[0].isMovement).toBe(false);
  });

  test("a prior further than the match radius is not matched at all", () => {
    const priors: PriorBox[] = [{ nx: 0.0, ny: 0.0, time: 1_000 }];
    const far = det(0.9, 0.9);
    expect(Math.hypot(far.nx, far.ny)).toBeGreaterThan(MATCH_RADIUS);
    const { boxes } = trackMotion([far], priors, 2_000);
    expect(boxes[0].velocity).toBe(0);
  });

  test("the nearest prior wins when several are in range", () => {
    const priors: PriorBox[] = [
      { nx: 0.40, ny: 0.5, time: 1_000 },
      { nx: 0.49, ny: 0.5, time: 1_000 },
    ];
    const { boxes } = trackMotion([det(0.5, 0.5)], priors, 2_000);
    // Matched the 0.49 prior (distance 0.01), not the 0.40 one.
    expect(boxes[0].velocity).toBeCloseTo(0.01, 3);
  });

  test("a near-instant second tick cannot produce an absurd velocity", () => {
    const priors: PriorBox[] = [{ nx: 0.3, ny: 0.5, time: 1_000 }];
    // 1ms later: the dt floor of 0.1s caps this at 0.2/0.1 = 2, not 200.
    const { boxes } = trackMotion([det(0.5, 0.5)], priors, 1_001);
    expect(boxes[0].velocity).toBeCloseTo(2, 3);
  });

  test("nextPriors carries every box forward stamped with now", () => {
    const { nextPriors } = trackMotion([det(0.1, 0.2), det(0.7, 0.8)], [], 5_000);
    expect(nextPriors).toEqual([
      { nx: 0.1, ny: 0.2, time: 5_000 },
      { nx: 0.7, ny: 0.8, time: 5_000 },
    ]);
  });

  test("labels and confidence survive tracking untouched", () => {
    const { boxes } = trackMotion([det(0.5, 0.5, "dog")], [], 1_000);
    expect(boxes[0].label).toBe("dog");
    expect(boxes[0].confidence).toBe(0.9);
    expect(boxes[0].nw).toBe(0.1);
  });

  test("an empty frame clears the priors rather than keeping ghosts", () => {
    const { boxes, nextPriors } = trackMotion([], [{ nx: 0.5, ny: 0.5, time: 1_000 }], 2_000);
    expect(boxes).toEqual([]);
    expect(nextPriors).toEqual([]);
  });
});
