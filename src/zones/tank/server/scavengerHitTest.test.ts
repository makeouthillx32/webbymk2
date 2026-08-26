import { describe, it, expect, beforeEach } from "bun:test";
import {
  evaluateTapHitTest,
  recordUserTargetClaim,
  spawnInteractiveTarget,
  getActiveTargets,
} from "./interactiveTargetDetector";

describe("Interactive Camera Scavenger & Object Detection Engine", () => {
  beforeEach(() => {
    // Spawn fresh test target
    spawnInteractiveTarget({
      camSlug: "living-room",
      roomKey: "living-room",
      roomTitle: "Living Room",
      label: "Test Energy Drink",
      kind: "trash",
      box: { xMin: 0.2, yMin: 0.3, xMax: 0.5, yMax: 0.6 },
      xpReward: 30,
      tokenReward: 15,
      maxClaimsPerUser: 3,
      durationMinutes: 60,
    });
  });

  it("accurately detects inside vs outside normalized taps", () => {
    // Inside tap (0.35, 0.45)
    const hit = evaluateTapHitTest("living-room", 0.35, 0.45);
    expect(hit).not.toBeNull();
    expect(hit?.label).toBe("Test Energy Drink");
    expect(hit?.xpReward).toBe(30);

    // Outside tap (0.1, 0.1)
    const miss = evaluateTapHitTest("living-room", 0.1, 0.1);
    expect(miss).toBeNull();

    // Wrong camera (kitchen)
    const wrongCam = evaluateTapHitTest("garage", 0.35, 0.45);
    expect(wrongCam).toBeNull();
  });

  it("enforces maximum claim quotas per user", () => {
    const userId = `test_user_${Date.now()}`;
    const targetId = "target_test_quota_123";

    // 1st Claim
    const claim1 = recordUserTargetClaim(userId, targetId, 3);
    expect(claim1.allowed).toBe(true);
    expect(claim1.currentClaims).toBe(1);

    // 2nd Claim
    const claim2 = recordUserTargetClaim(userId, targetId, 3);
    expect(claim2.allowed).toBe(true);
    expect(claim2.currentClaims).toBe(2);

    // 3rd Claim
    const claim3 = recordUserTargetClaim(userId, targetId, 3);
    expect(claim3.allowed).toBe(true);
    expect(claim3.currentClaims).toBe(3);

    // 4th Claim (Blocked)
    const claim4 = recordUserTargetClaim(userId, targetId, 3);
    expect(claim4.allowed).toBe(false);
    expect(claim4.currentClaims).toBe(3);
  });

  it("lists active targets across house rooms", () => {
    const targets = getActiveTargets();
    expect(targets.length).toBeGreaterThan(0);
    const livingRoomTargets = getActiveTargets("living-room");
    expect(livingRoomTargets.length).toBeGreaterThan(0);
    expect(livingRoomTargets.every((t) => t.camSlug === "living-room" || t.roomKey === "living-room")).toBe(true);
  });
});
