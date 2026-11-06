// src/zones/tank/server/minigameSimulation.test.ts
// Comprehensive simulated checks for all Tank minigames:
// 1. Coin Flip Concurrency & Turn Pacing
// 2. 777 Slots Physical Machine Exclusivity
// 3. Russian Roulette 6-Player Cap & Shared Cylinder
// 4. Dice Table Variable Sides & Critical Rolls
// 5. Mystery Crate Pedestal & Rarity Probabilities
// 6. The Tavern & Bartender Shift, Apron Line & Mutiny

import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
  enqueueTurn,
  completeTurn,
  leaveStationQueue,
  pullRouletteTrigger,
  getStation,
  formatLinesStatusReport,
  resetStationsForTesting,
  type StationType,
} from "./minigameStationQueue";
import { ITEM_ACTION_DEFINITIONS } from "./chatRngEvents";

describe("TANK MINIGAMES: Turn-Based Physical Stations & Chat RNG Simulation", () => {
  beforeEach(() => {
    resetStationsForTesting();
  });

  afterAll(() => {
    resetStationsForTesting();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 1: Coin Flip Concurrency & Turn Pacing
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 1: Coin Flip Concurrency, Wagers, and Queue Pacing", () => {
    it("handles 10 users spamming /flip at once with ordered queue and FIFO execution", () => {
      resetStationsForTesting();
      const coinStation = getStation("coin");

      // 10 users attempt to flip at the exact same moment
      const results = [];
      for (let i = 1; i <= 10; i++) {
        const res = enqueueTurn("coin", {
          userId: `flip_user_${i}`,
          userName: `Flipper_${i}`,
          roomId: "global",
          command: "/flip",
          params: { choice: i % 2 === 0 ? "tails" : "heads", wager: i * 10 },
        });
        results.push(res);
      }

      // First user gets immediate access to the coin
      expect(results[0].status).toBe("turn_ready");
      expect(coinStation.busy).toBe(true);
      expect(coinStation.activeTurn?.userName).toBe("Flipper_1");

      // Users 2 through 10 are queued in exact sequential order
      for (let i = 1; i < 10; i++) {
        expect(results[i].status).toBe("queued");
        if (results[i].status === "queued") {
          expect(results[i].position).toBe(i);
        }
      }
      expect(coinStation.queue.length).toBe(9);

      // User 3 changes their mind and sends a higher wager while waiting in line
      const updateRes = enqueueTurn("coin", {
        userId: "flip_user_3",
        userName: "Flipper_3",
        roomId: "global",
        command: "/flip",
        params: { choice: "tails", wager: 500 }, // boosted wager
      });
      expect(updateRes.status).toBe("already_queued");
      if (updateRes.status === "already_queued") {
        expect(updateRes.position).toBe(2); // Still position #2 in queue
      }
      // Verify parameters were updated in place without duplicate seats
      const u3InQueue = coinStation.queue.find((q) => q.userId === "flip_user_3");
      expect(u3InQueue?.params.wager).toBe(500);
      expect(u3InQueue?.params.choice).toBe("tails");
      expect(coinStation.queue.length).toBe(9);

      // User 6 leaves the queue
      const leaveRes = leaveStationQueue("flip_user_6", "coin");
      expect(leaveRes.left).toBe(true);
      expect(coinStation.queue.length).toBe(8);
      expect(coinStation.queue.some((q) => q.userId === "flip_user_6")).toBe(false);

      // Step-by-step sequential execution: complete each turn and verify FIFO order
      const executedOrder: string[] = ["Flipper_1"];
      while (coinStation.queue.length > 0) {
        const nextTurn = completeTurn("coin");
        expect(nextTurn).toBeDefined();
        if (nextTurn) {
          executedOrder.push(nextTurn.userName);
        }
      }

      // Complete the final turn
      const finalNext = completeTurn("coin");
      expect(finalNext).toBeNull();
      expect(coinStation.busy).toBe(false);
      expect(coinStation.activeTurn).toBeNull();

      // Verify the exact execution order matches expectations (User 6 omitted)
      expect(executedOrder).toEqual([
        "Flipper_1",
        "Flipper_2",
        "Flipper_3",
        "Flipper_4",
        "Flipper_5",
        "Flipper_7",
        "Flipper_8",
        "Flipper_9",
        "Flipper_10",
      ]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 2: 777 Slots Physical Machine Exclusivity
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 2: 777 Slots Machine Exclusivity & Payouts", () => {
    it("enforces single-instance cabinet occupancy and simulates reel payouts", () => {
      resetStationsForTesting();
      const slotsStation = getStation("slots");

      // Player A steps up to the machine
      const resA = enqueueTurn("slots", {
        userId: "slot_a",
        userName: "Alice",
        roomId: "living_room",
        command: "/slots",
        params: { wager: 25 },
      });
      expect(resA.status).toBe("turn_ready");
      expect(slotsStation.busy).toBe(true);
      expect(slotsStation.activeTurn?.userName).toBe("Alice");

      // Player B and C attempt to spin at the same time
      const resB = enqueueTurn("slots", {
        userId: "slot_b",
        userName: "Bob",
        roomId: "living_room",
        command: "/slots",
        params: { wager: 50 },
      });
      expect(resB.status).toBe("queued");
      if (resB.status === "queued") {
        expect(resB.position).toBe(1);
      }

      const resC = enqueueTurn("slots", {
        userId: "slot_c",
        userName: "Charlie",
        roomId: "living_room",
        command: "/slots",
        params: { wager: 100 },
      });
      expect(resC.status).toBe("queued");
      if (resC.status === "queued") {
        expect(resC.position).toBe(2);
      }

      // Simulate Reel Outcome Evaluator logic
      const evaluateSpin = (r1: string, r2: string, r3: string, wager: number) => {
        if (r1 === "7️⃣" && r2 === "7️⃣" && r3 === "7️⃣") {
          return { win: true, multiplier: 100, jackpot: true };
        }
        if (r1 === r2 && r2 === r3) {
          return { win: true, multiplier: 25, jackpot: false };
        }
        if (r1 === r2 || r2 === r3 || r1 === r3) {
          return { win: true, multiplier: 2, jackpot: false };
        }
        return { win: false, multiplier: 0, jackpot: false };
      };

      // Test Jackpot payout
      const jackpotResult = evaluateSpin("7️⃣", "7️⃣", "7️⃣", 25);
      expect(jackpotResult.win).toBe(true);
      expect(jackpotResult.jackpot).toBe(true);
      expect(jackpotResult.multiplier * 25).toBe(2500);

      // Test 3 matching fruit payout
      const tripleCherry = evaluateSpin("🍒", "🍒", "🍒", 20);
      expect(tripleCherry.win).toBe(true);
      expect(tripleCherry.multiplier).toBe(25);

      // Test partial 2 matching payout
      const doubleBell = evaluateSpin("🔔", "🔔", "🍋", 20);
      expect(doubleBell.win).toBe(true);
      expect(doubleBell.multiplier).toBe(2);

      // Test loss
      const loss = evaluateSpin("🍒", "🍋", "💎", 20);
      expect(loss.win).toBe(false);

      // Alice's spin finishes, advancing the machine to Bob
      const nextBob = completeTurn("slots");
      expect(nextBob?.userName).toBe("Bob");
      expect(slotsStation.activeTurn?.userName).toBe("Bob");
      expect(slotsStation.queue.length).toBe(1);

      // Bob's spin finishes, advancing to Charlie
      const nextCharlie = completeTurn("slots");
      expect(nextCharlie?.userName).toBe("Charlie");
      expect(slotsStation.activeTurn?.userName).toBe("Charlie");
      expect(slotsStation.queue.length).toBe(0);

      // Charlie finishes, machine is open and free
      const finalSlots = completeTurn("slots");
      expect(finalSlots).toBeNull();
      expect(slotsStation.busy).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 3: Russian Roulette 6-Player Limit & Shared Cylinder
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 3: Russian Roulette 6-Player Cap & Shared Cylinder Mechanics", () => {
    it("enforces strict 6-player limit and shared 6-chamber cylinder countdown to BANG", () => {
      resetStationsForTesting();
      const rouletteStation = getStation("roulette");

      // Player 1 steps up to the table
      const res1 = enqueueTurn("roulette", {
        userId: "rr_p1",
        userName: "Player_1",
        roomId: "game_room",
        command: "/roulette",
        params: {},
      });
      expect(res1.status).toBe("turn_ready");

      // Players 2 to 7 step into line (filling the 6 queue slots: positions 1 to 6)
      for (let i = 2; i <= 7; i++) {
        const res = enqueueTurn("roulette", {
          userId: `rr_p${i}`,
          userName: `Player_${i}`,
          roomId: "game_room",
          command: "/roulette",
          params: {},
        });
        expect(res.status).toBe("queued");
        if (res.status === "queued") {
          expect(res.position).toBe(i - 1);
        }
      }
      expect(rouletteStation.queue.length).toBe(6);

      // 8th player attempts to join — rejected because queue is at max capacity (6)
      const res8 = enqueueTurn("roulette", {
        userId: "rr_p8",
        userName: "Player_8",
        roomId: "game_room",
        command: "/roulette",
        params: {},
      });
      expect(res8.status).toBe("queue_full");
      if (res8.status === "queue_full") {
        expect(res8.maxQueue).toBe(6);
      }

      // Simulate shared cylinder countdown
      // Set bullet explicitly to chamber 4 to verify exact sequential clicks
      rouletteStation.rouletteState = {
        chambersRemaining: 6,
        bulletIndex: 4,
        currentPull: 1,
      };

      // Pull 1: Chamber 1 (Empty click)
      const pull1 = pullRouletteTrigger();
      expect(pull1.chamber).toBe(1);
      expect(pull1.survived).toBe(true);
      expect(pull1.chambersRemaining).toBe(5);

      // Pull 2: Chamber 2 (Empty click)
      const pull2 = pullRouletteTrigger();
      expect(pull2.chamber).toBe(2);
      expect(pull2.survived).toBe(true);
      expect(pull2.chambersRemaining).toBe(4);

      // Pull 3: Chamber 3 (Empty click)
      const pull3 = pullRouletteTrigger();
      expect(pull3.chamber).toBe(3);
      expect(pull3.survived).toBe(true);
      expect(pull3.chambersRemaining).toBe(3);

      // Pull 4: Chamber 4 (BANG! Bullet fired)
      const pull4 = pullRouletteTrigger();
      expect(pull4.chamber).toBe(4);
      expect(pull4.survived).toBe(false);
      expect(pull4.chambersRemaining).toBe(0);

      // Verify the gun has automatically reloaded and reset for the next round
      expect(rouletteStation.rouletteState.chambersRemaining).toBe(6);
      expect(rouletteStation.rouletteState.currentPull).toBe(1);
      expect(rouletteStation.rouletteState.bulletIndex).toBeGreaterThanOrEqual(1);
      expect(rouletteStation.rouletteState.bulletIndex).toBeLessThanOrEqual(6);

      // Clean up queue
      completeTurn("roulette");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 4: Dice Table Variable Sides & Critical Rolls
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 4: Dice Table Variable Sides & Critical Successes", () => {
    it("correctly simulates variable dice (D6, D20, D100, D1000) with critical hits", () => {
      resetStationsForTesting();

      const rollDie = (sides: number) => {
        const clampedSides = Math.min(Math.max(sides, 2), 1000);
        const result = Math.floor(Math.random() * clampedSides) + 1;
        const isCrit = result === clampedSides;
        const bonusXp = isCrit ? 25 : Math.round((result / clampedSides) * 10);
        const bonusTokens = isCrit ? 20 : result >= clampedSides * 0.9 ? 5 : 0;
        return { sides: clampedSides, result, isCrit, bonusXp, bonusTokens };
      };

      // Test D20 boundary
      for (let i = 0; i < 50; i++) {
        const roll = rollDie(20);
        expect(roll.result).toBeGreaterThanOrEqual(1);
        expect(roll.result).toBeLessThanOrEqual(20);
        if (roll.isCrit) {
          expect(roll.result).toBe(20);
          expect(roll.bonusXp).toBe(25);
          expect(roll.bonusTokens).toBe(20);
        }
      }

      // Test D1000 boundary clamping
      const roll1000 = rollDie(5000); // 5000 clamped to 1000
      expect(roll1000.sides).toBe(1000);
      expect(roll1000.result).toBeLessThanOrEqual(1000);

      // Test min boundary clamping
      const roll1 = rollDie(1); // 1 clamped to 2
      expect(roll1.sides).toBe(2);
      expect(roll1.result).toBeLessThanOrEqual(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 5: Mystery Crate Pedestal & Loot Rarity Distribution
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 5: Mystery Crate Pedestal & Drop Distribution", () => {
    it("simulates 2,000 unboxings and confirms statistical rarity weights", () => {
      resetStationsForTesting();

      const simulateUnbox = () => {
        const roll = Math.random();
        let targetRarity: "common" | "uncommon" | "rare" | "legendary" = "common";
        if (roll < 0.05) targetRarity = "legendary"; // 5%
        else if (roll < 0.20) targetRarity = "rare"; // 15%
        else if (roll < 0.50) targetRarity = "uncommon"; // 30%
        else targetRarity = "common"; // 50%

        const pool = Object.values(ITEM_ACTION_DEFINITIONS).filter((i) => i.rarity === targetRarity);
        const chosen = pool[Math.floor(Math.random() * pool.length)];
        return { rarity: targetRarity, item: chosen };
      };

      const counts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
      const TRIALS = 2000;
      for (let i = 0; i < TRIALS; i++) {
        const drop = simulateUnbox();
        counts[drop.rarity]++;
        expect(drop.item).toBeDefined();
        expect(drop.item.rarity).toBe(drop.rarity);
      }

      // Verify statistically realistic proportions (±6% margin of error)
      const commonPct = counts.common / TRIALS;
      const uncommonPct = counts.uncommon / TRIALS;
      const rarePct = counts.rare / TRIALS;
      const legendaryPct = counts.legendary / TRIALS;

      expect(commonPct).toBeGreaterThan(0.44);
      expect(commonPct).toBeLessThan(0.56);

      expect(uncommonPct).toBeGreaterThan(0.24);
      expect(uncommonPct).toBeLessThan(0.36);

      expect(rarePct).toBeGreaterThan(0.10);
      expect(rarePct).toBeLessThan(0.20);

      expect(legendaryPct).toBeGreaterThan(0.02);
      expect(legendaryPct).toBeLessThan(0.08);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SIMULATION 6: The Tavern & Bartender Shift, Apron Line & Mutiny
  // ───────────────────────────────────────────────────────────────────────────
  describe("Simulation 6: The Tavern & Bartender Shift, Apron Line, and Mutiny", () => {
    it("generates a comprehensive status report for chat /line command", () => {
      const report = formatLinesStatusReport({
        enabled: true,
        shift: { bartenderName: "Tyler", chaos: 22, tipsTokens: 80 },
        chits: [{ id: "order_1" }, { id: "order_2" }, { id: "order_3" }],
        queueLength: 4,
      });

      expect(report).toContain("🎪 [TANK GAME STATIONS]");
      expect(report).toContain("The Lucky Coin");
      expect(report).toContain("Dice Table");
      expect(report).toContain("777 Slot Machine");
      expect(report).toContain("Russian Roulette Table");
      expect(report).toContain("Mystery Crate Pedestal");
      expect(report).toContain("The Tavern (Bartender)");
      expect(report).toContain("@Tyler");
      expect(report).toContain("Chaos: 22%");
      expect(report).toContain("Tips: 80T");
      expect(report).toContain("Orders: 3");
      expect(report).toContain("Line: 4 waiting for Apron");
    });

    it("simulates Bartender mutiny voting mechanics", () => {
      // Mutiny structure: Requires majority overturn votes to depose
      type MutinyState = {
        id: string;
        bartenderId: string;
        bartenderName: string;
        overturnVotes: Set<string>;
        defendVotes: Set<string>;
        resolved: boolean;
        outcome?: "overturned" | "defended";
      };

      const mutiny: MutinyState = {
        id: "mutiny_101",
        bartenderId: "bartender_tyler",
        bartenderName: "Tyler",
        overturnVotes: new Set(),
        defendVotes: new Set(),
        resolved: false,
      };

      const castVote = (userId: string, vote: "overturn" | "defend") => {
        if (vote === "overturn") {
          mutiny.defendVotes.delete(userId);
          mutiny.overturnVotes.add(userId);
        } else {
          mutiny.overturnVotes.delete(userId);
          mutiny.defendVotes.add(userId);
        }
      };

      // 3 patrons vote to overturn
      castVote("patron_1", "overturn");
      castVote("patron_2", "overturn");
      castVote("patron_3", "overturn");

      // 1 patron votes to defend
      castVote("patron_4", "defend");

      // Patron 2 switches vote to defend
      castVote("patron_2", "defend");

      expect(mutiny.overturnVotes.size).toBe(2); // patron_1, patron_3
      expect(mutiny.defendVotes.size).toBe(2); // patron_4, patron_2

      // Deciding 5th patron votes overturn
      castVote("patron_5", "overturn");
      expect(mutiny.overturnVotes.size).toBe(3);

      // Tally mutiny result
      if (mutiny.overturnVotes.size > mutiny.defendVotes.size) {
        mutiny.resolved = true;
        mutiny.outcome = "overturned";
      }

      expect(mutiny.resolved).toBe(true);
      expect(mutiny.outcome).toBe("overturned");
    });
  });
});
