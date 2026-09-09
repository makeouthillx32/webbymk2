import { describe, it, expect } from "bun:test";
import {
  evaluateTapHitTest,
  spawnInteractiveTarget,
  calculateTargetAgeXp,
  clearInteractiveTarget,
  evaluateTrashReScanClearance,
  type InteractiveTarget,
} from "./interactiveTargetDetector";

describe("Trash & Interactive Target Touch Detection System", () => {
  it("evaluates normalized percentage touch taps precisely within bounding box [xMin, yMin, xMax, yMax]", () => {
    const target = spawnInteractiveTarget({
      camSlug: "living-room",
      roomKey: "living-room",
      roomTitle: "Living Room",
      label: "Crushed Soda Can",
      kind: "trash",
      box: { xMin: 0.2, yMin: 0.3, xMax: 0.4, yMax: 0.5 },
      xpReward: 25,
    });

    // Tap inside the box
    const hit = evaluateTapHitTest("living-room", 0.25, 0.35);
    expect(hit).not.toBeNull();
    expect(hit?.id).toBe(target.id);
    expect(hit?.label).toBe("Crushed Soda Can");

    // Touch input gets a small normalized tolerance so a finger near the
    // visible edge still claims the target without making distant taps hit.
    expect(evaluateTapHitTest("living-room", 0.18, 0.35)?.id).toBe(target.id);

    // Tap outside the box
    const miss = evaluateTapHitTest("living-room", 0.1, 0.1);
    expect(miss).toBeNull();
  });

  it("calculates age-based XP multiplier (the longer trash sits, the more XP per tap)", () => {
    const now = Date.now();
    const tenMinutesAgo = now - 10 * 60 * 1000;

    const freshTarget: InteractiveTarget = {
      id: "fresh-trash",
      camSlug: "kitchen",
      roomKey: "kitchen",
      roomTitle: "Kitchen",
      label: "Banana Peel",
      kind: "trash",
      box: { xMin: 0.1, yMin: 0.1, xMax: 0.3, yMax: 0.3 },
      xpReward: 20,
      tokenReward: 10,
      maxClaimsPerUser: 1,
      active: true,
      createdAt: now,
      expiresAt: now + 3600000,
    };

    const oldTarget: InteractiveTarget = {
      ...freshTarget,
      id: "old-trash",
      createdAt: tenMinutesAgo,
    };

    const freshResult = calculateTargetAgeXp(freshTarget, now);
    expect(freshResult.ageMinutes).toBe(0);
    expect(freshResult.ageBonusXp).toBe(0);
    expect(freshResult.totalXp).toBe(20);

    // 10 minutes * 5 XP/min = +50 XP bonus
    const oldResult = calculateTargetAgeXp(oldTarget, now);
    expect(oldResult.ageMinutes).toBe(10);
    expect(oldResult.ageBonusXp).toBe(50);
    expect(oldResult.totalXp).toBe(70);
  });

  it("clears trash targets upon collection and removes from active hit testing", () => {
    const target = spawnInteractiveTarget({
      camSlug: "game-room",
      roomKey: "game-room",
      roomTitle: "Game Room",
      label: "Empty Snack Wrapper",
      kind: "trash",
      box: { xMin: 0.5, yMin: 0.5, xMax: 0.7, yMax: 0.7 },
      xpReward: 30,
    });

    // 1. Initial hit test succeeds
    expect(evaluateTapHitTest("game-room", 0.6, 0.6)).not.toBeNull();

    // 2. Clear target
    const clearResult = clearInteractiveTarget(target.id);
    expect(clearResult.cleared).toBe(true);

    // 3. Subsequent hit test ignores cleared target
    expect(evaluateTapHitTest("game-room", 0.6, 0.6)).toBeNull();
  });

  it("evaluates vision re-scan clearance when trash is no longer detected at last known coordinates", () => {
    const target = spawnInteractiveTarget({
      camSlug: "kitchen",
      roomKey: "kitchen",
      roomTitle: "Kitchen",
      label: "Pizza Crust",
      kind: "trash",
      box: { xMin: 0.1, yMin: 0.1, xMax: 0.2, yMax: 0.2 },
      xpReward: 25,
    });

    // New scan detects no objects near [0.1, 0.1, 0.2, 0.2]
    const detectedBoxes = [
      { xMin: 0.8, yMin: 0.8, xMax: 0.9, yMax: 0.9 }, // Over in opposite corner
    ];

    const cleared = evaluateTrashReScanClearance("kitchen", detectedBoxes);
    expect(cleared.some((c) => c.id === target.id)).toBe(true);
  });
});
