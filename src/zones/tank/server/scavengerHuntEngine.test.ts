import { describe, it, expect, beforeEach } from "bun:test";
import {
  ingestScavengerCandidates,
  generateScavengerQuest,
  claimScavengerQuestTap,
  tickScavengerHuntEngine,
  clearScavengerQuest,
} from "./scavengerHuntEngine";

describe("Autonomous YOLO Vision Scavenger Hunt Engine", () => {
  beforeEach(() => {
    clearScavengerQuest();
  });

  it("qualifies stagnant objects after resting stationary for 4+ seconds", () => {
    const rawBoxes = [
      { nx: 0.35, ny: 0.45, nw: 0.1, nh: 0.12, label: "cup", confidence: 0.92 },
      { nx: 0.70, ny: 0.20, nw: 0.15, nh: 0.25, label: "person", confidence: 0.95 },
    ];

    const t0 = 100000;
    // 1. First seen at t0 -> 0 stagnant candidates
    const firstIngest = ingestScavengerCandidates("kitchen", "cam-kitchen", rawBoxes, t0);
    expect(firstIngest.length).toBe(0);

    // 2. Seen at t0 + 2000ms -> still not stagnant (2s < 4s)
    const secondIngest = ingestScavengerCandidates("kitchen", "cam-kitchen", rawBoxes, t0 + 2000);
    expect(secondIngest.length).toBe(0);

    // 3. Seen at t0 + 4500ms -> stagnant! (4.5s >= 4s)
    const thirdIngest = ingestScavengerCandidates("kitchen", "cam-kitchen", rawBoxes, t0 + 4500);
    expect(thirdIngest.length).toBe(1);
    expect(thirdIngest[0].definition.displayName).toBe("Coffee Mug");
    expect(thirdIngest[0].roomKey).toBe("kitchen");
  });

  it("spawns a live scavenger quest and resolves atomic first-to-claim winner", () => {
    const t0 = 200000;
    // Ingest stationary backpack in living room
    ingestScavengerCandidates(
      "living-room",
      "cam-living-room",
      [{ nx: 0.40, ny: 0.50, nw: 0.15, nh: 0.20, label: "backpack", confidence: 0.9 }],
      t0
    );
    ingestScavengerCandidates(
      "living-room",
      "cam-living-room",
      [{ nx: 0.40, ny: 0.50, nw: 0.15, nh: 0.20, label: "backpack", confidence: 0.9 }],
      t0 + 5000
    );

    const quest = generateScavengerQuest({ roomKey: "living-room", now: t0 + 5000 });
    expect(quest.state).toBe("QUEST_ACTIVE");
    expect(quest.item.displayName).toBe("Backpack / Rucksack");
    expect(quest.item.rewardTokens).toBe(60);

    // 1. Viewer 1 misses (tap is far away at 0.1, 0.1)
    const missResult = claimScavengerQuestTap({
      questId: quest.id,
      userId: "viewer_1",
      userName: "Alex",
      tapNx: 0.1,
      tapNy: 0.1,
      now: t0 + 6000,
    });
    expect(missResult.success).toBe(false);

    // 2. Viewer 2 taps the backpack (0.45, 0.55) -> WINS!
    const winResult = claimScavengerQuestTap({
      questId: quest.id,
      userId: "viewer_2",
      userName: "EagleEye",
      tapNx: 0.45,
      tapNy: 0.55,
      now: t0 + 7000,
    });
    expect(winResult.success).toBe(true);
    expect(winResult.rewardTokens).toBe(60);
    expect(winResult.rewardXp).toBe(90);
    expect(quest.state).toBe("CLAIMED_FANFARE");
    expect(quest.claimedBy?.userName).toBe("EagleEye");

    // 3. Viewer 3 taps the backpack afterwards -> REJECTED (Already solved!)
    const lateResult = claimScavengerQuestTap({
      questId: quest.id,
      userId: "viewer_3",
      userName: "SlowPoke",
      tapNx: 0.45,
      tapNy: 0.55,
      now: t0 + 8000,
    });
    expect(lateResult.success).toBe(false);
    expect(lateResult.reason).toContain("already solved");
  });

  it("expires active quest when duration timer runs out", () => {
    const t0 = 300000;
    const quest = generateScavengerQuest({ durationSeconds: 30, now: t0 });

    // Active at t0 + 10s
    tickScavengerHuntEngine(t0 + 10000);
    expect(quest.state).toBe("QUEST_ACTIVE");

    // Expired at t0 + 35s
    tickScavengerHuntEngine(t0 + 35000);
    expect(quest.state).toBe("EXPIRED");
  });
});
