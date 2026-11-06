import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  enqueueTurn,
  completeTurn,
  leaveStationQueue,
  pullRouletteTrigger,
  getStation,
  formatLinesStatusReport,
  resetStationsForTesting,
} from "./minigameStationQueue";

describe("Tank Minigame Station Queue & Turn System", () => {
  beforeAll(() => {
    resetStationsForTesting();
  });

  afterAll(() => {
    resetStationsForTesting();
  });
  it("allows immediate play when a station is idle", () => {
    const res = enqueueTurn("coin", {
      userId: "user_a",
      userName: "Alice",
      roomId: "global",
      command: "/flip",
      params: { choice: "heads", wager: 10 },
    });
    expect(res.status).toBe("turn_ready");

    const station = getStation("coin");
    expect(station.busy).toBe(true);
    expect(station.activeTurn?.userName).toBe("Alice");
    expect(station.queue.length).toBe(0);
  });

  it("queues subsequent players when the station is busy", () => {
    const resB = enqueueTurn("coin", {
      userId: "user_b",
      userName: "Bob",
      roomId: "global",
      command: "/flip",
      params: { choice: "tails", wager: 20 },
    });
    expect(resB.status).toBe("queued");
    if (resB.status === "queued") {
      expect(resB.position).toBe(1);
      expect(resB.queueLength).toBe(1);
    }

    const resC = enqueueTurn("coin", {
      userId: "user_c",
      userName: "Charlie",
      roomId: "global",
      command: "/flip",
      params: { choice: "heads", wager: 50 },
    });
    expect(resC.status).toBe("queued");
    if (resC.status === "queued") {
      expect(resC.position).toBe(2);
      expect(resC.queueLength).toBe(2);
    }
  });

  it("prevents duplicate entries in line for the same player", () => {
    const resB2 = enqueueTurn("coin", {
      userId: "user_b",
      userName: "Bob",
      roomId: "global",
      command: "/flip",
      params: { choice: "heads", wager: 100 },
    });
    expect(resB2.status).toBe("already_queued");
    if (resB2.status === "already_queued") {
      expect(resB2.position).toBe(1);
    }
    const station = getStation("coin");
    expect(station.queue.length).toBe(2);
  });

  it("advances the queue in order when a turn finishes", () => {
    const next1 = completeTurn("coin");
    expect(next1).toBeDefined();
    expect(next1?.userName).toBe("Bob");
    expect(next1?.params.wager).toBe(100); // Updated params

    const station = getStation("coin");
    expect(station.busy).toBe(true);
    expect(station.activeTurn?.userName).toBe("Bob");
    expect(station.queue.length).toBe(1);

    const next2 = completeTurn("coin");
    expect(next2).toBeDefined();
    expect(next2?.userName).toBe("Charlie");

    const next3 = completeTurn("coin");
    expect(next3).toBeNull();
    expect(station.busy).toBe(false);
    expect(station.activeTurn).toBeNull();
  });

  it("allows players to leave the queue with /leave", () => {
    enqueueTurn("slots", {
      userId: "user_p1",
      userName: "Player1",
      roomId: "global",
      command: "/slots",
      params: { wager: 20 },
    });
    enqueueTurn("slots", {
      userId: "user_p2",
      userName: "Player2",
      roomId: "global",
      command: "/slots",
      params: { wager: 20 },
    });

    const leaveRes = leaveStationQueue("user_p2", "slots");
    expect(leaveRes.left).toBe(true);

    const station = getStation("slots");
    expect(station.queue.length).toBe(0);

    completeTurn("slots");
  });

  it("simulates sequential shared-cylinder Russian roulette", () => {
    // Repeatedly pull trigger until a bullet fires and verify cylinder tracking
    let pulls = 0;
    let fired = false;
    while (pulls < 7 && !fired) {
      pulls += 1;
      const result = pullRouletteTrigger();
      if (!result.survived) {
        fired = true;
        expect(result.chambersRemaining).toBe(0);
      } else {
        expect(result.chambersRemaining).toBeGreaterThanOrEqual(0);
      }
    }
    expect(fired).toBe(true);
  });

  it("enforces a maximum of 6 players in Russian Roulette queue", () => {
    // Fill the roulette active turn
    enqueueTurn("roulette", {
      userId: "roulette_lead",
      userName: "LeadPlayer",
      roomId: "global",
      command: "/roulette",
      params: {},
    });

    // Enqueue 6 players (the maximum queue capacity for roulette)
    for (let i = 1; i <= 6; i++) {
      const res = enqueueTurn("roulette", {
        userId: `roulette_p${i}`,
        userName: `Challenger_${i}`,
        roomId: "global",
        command: "/roulette",
        params: {},
      });
      expect(res.status).toBe("queued");
      if (res.status === "queued") {
        expect(res.position).toBe(i);
      }
    }

    // 7th player must be rejected as queue is full
    const fullRes = enqueueTurn("roulette", {
      userId: "roulette_p7",
      userName: "Challenger_7",
      roomId: "global",
      command: "/roulette",
      params: {},
    });
    expect(fullRes.status).toBe("queue_full");
    if (fullRes.status === "queue_full") {
      expect(fullRes.maxQueue).toBe(6);
    }

    // Clean up
    completeTurn("roulette");
  });

  it("formats a comprehensive line report for /line including Tavern", () => {
    const reportWithoutTavern = formatLinesStatusReport();
    expect(reportWithoutTavern).toContain("🎪 [TANK GAME STATIONS]");
    expect(reportWithoutTavern).toContain("The Lucky Coin");
    expect(reportWithoutTavern).toContain("777 Slot Machine");
    expect(reportWithoutTavern).toContain("Dice Table");

    const reportWithTavern = formatLinesStatusReport({
      enabled: true,
      shift: { bartenderName: "Tyler", chaos: 15, tipsTokens: 45 },
      chits: [{ id: "c1" }, { id: "c2" }],
      queueLength: 3,
    });
    expect(reportWithTavern).toContain("The Tavern (Bartender)");
    expect(reportWithTavern).toContain("@Tyler");
    expect(reportWithTavern).toContain("Chaos: 15%");
    expect(reportWithTavern).toContain("Orders: 2");
    expect(reportWithTavern).toContain("Line: 3 waiting for Apron");
  });
});
