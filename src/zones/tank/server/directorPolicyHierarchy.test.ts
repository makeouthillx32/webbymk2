import { describe, it, expect, beforeEach } from "bun:test";
import {
  resolveEffectiveDirectorDecision,
  applyDirectorItemOverride,
  getActiveItemOverride,
  clearItemOverride,
} from "./directorPolicyHierarchy";

describe("Hardened Director Policy Hierarchy & Override Timeline", () => {
  beforeEach(() => {
    clearItemOverride();
  });

  it("prioritizes Level 1 Admin Lock over item overrides and operator modes", () => {
    const now = 100000;
    const adminLock = {
      active: true,
      targetType: "camera" as const,
      targetId: "cam-living-room",
      targetLabel: "Living Room Staff Lock",
      expiresAt: now + 60000,
      durationMinutes: 1 as const,
      lockedBy: "Operator Tyler",
      multiCameraMode: "fixed_primary" as const,
      startedAt: now,
    };

    const itemOverride = {
      active: true,
      itemSlug: "cat-laser",
      itemName: "Cat Laser Pointer",
      targetMode: "animals" as const,
      triggeredBy: "SpectatorCatLover",
      startedAt: now,
      expiresAt: now + 45000,
      durationSeconds: 45,
    };

    const decision = resolveEffectiveDirectorDecision({
      attentionLock: adminLock,
      itemOverride,
      operatorMode: "group",
      suggestedMode: "speaker",
      now,
    });

    expect(decision.activeOverrideType).toBe("ADMIN_LOCK");
    expect(decision.effectiveMode).toBe("manual");
    expect(decision.targetCameraId).toBe("cam-living-room");
    expect(decision.timeRemainingSeconds).toBe(60);
  });

  it("prioritizes Level 2 Item Override when Admin Lock is inactive", () => {
    const now = 200000;
    const itemOverride = applyDirectorItemOverride({
      itemSlug: "cat-treats",
      itemName: "Cat Treats",
      targetMode: "animals",
      targetRoomKey: "kitchen",
      triggeredBy: "MochiFan",
      durationSeconds: 45,
      now,
    });

    const decision = resolveEffectiveDirectorDecision({
      attentionLock: null,
      itemOverride,
      operatorMode: "speaker",
      suggestedMode: "auto",
      now,
    });

    expect(decision.activeOverrideType).toBe("ITEM_OVERRIDE");
    expect(decision.effectiveMode).toBe("animals");
    expect(decision.targetRoomKey).toBe("kitchen");
    expect(decision.timeRemainingSeconds).toBe(45);
  });

  it("automatically reverts to Level 3 Operator Mode when item override expires", () => {
    const startTime = 300000;
    applyDirectorItemOverride({
      itemSlug: "spotlight",
      itemName: "Room Spotlight",
      targetMode: "group",
      triggeredBy: "CrowdSurfer",
      durationSeconds: 30,
      now: startTime,
    });

    // 1. Active at t = 10s
    const activeDecision = resolveEffectiveDirectorDecision({
      operatorMode: "speaker",
      now: startTime + 10000,
    });
    expect(activeDecision.activeOverrideType).toBe("ITEM_OVERRIDE");
    expect(activeDecision.effectiveMode).toBe("group");

    // 2. Expired at t = 35s -> Reverts to operatorMode ("speaker")
    const expiredDecision = resolveEffectiveDirectorDecision({
      operatorMode: "speaker",
      now: startTime + 35000,
    });
    expect(expiredDecision.activeOverrideType).toBe("OPERATOR_MODE");
    expect(expiredDecision.effectiveMode).toBe("speaker");
    expect(getActiveItemOverride(startTime + 35000)).toBeNull();
  });
});
