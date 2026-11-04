import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  warmupServerDirector,
  getServerDirectorState,
  getServerDirectorWorkerHealth,
  shouldDirectProgramme,
  startDirectorTicking,
  tickServerDirector,
} from "./serverDirectorEngine";

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = async (input: any, init?: any) => {
    return new Response(JSON.stringify({ ok: true, data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe("Autonomous Server Director Warmup & 24/7 Background Lifecycle", () => {
  test("warms up the server director immediately and compiles cameras onto canvas", async () => {
    const warmedState = await warmupServerDirector();

    expect(warmedState).toBeDefined();
    expect(warmedState.activeCameraId).toBeDefined();
    expect(warmedState.activeRoomKey).toBeDefined();
    expect(["STANDBY", "AUTO_TRACKING", "ATTENTION", "MANUAL_PILOT", "GAME"]).toContain(
      warmedState.mode,
    );
    expect(warmedState.updatedAt).toBeGreaterThan(0);
  });

  test("serves warm director state instantly without cold-start delay", async () => {
    const startTime = Date.now();
    const state = await getServerDirectorState();
    const duration = Date.now() - startTime;

    expect(state).toBeDefined();
    // This suite has no cameras (fetch returns nothing), so nothing is on air:
    // GAME, with no camera claimed. It used to assert a non-empty id, which
    // only passed because the boot state hard-coded cam-…090 and never let go.
    expect(state.mode).toBe("GAME");
    expect(state.activeCameraId).toBe("");
    // Should return fast from pre-warmed memory
    expect(duration).toBeLessThan(100);
  });

  test("GAME directs game cams: a staff take holds, with its own countdown", async () => {
    const { setGameCamHold, clearGameCamHold } = await import("./gameCams");
    // Seed the published game cams (normally rooms3d/rooms.json).
    globalThis.__tankGameCamKeys = { keys: ["foyer", "kitchen"], at: Date.now() };
    try {
      const touring = await tickServerDirector();
      expect(touring.mode).toBe("GAME");
      expect(touring.activeCameraId).toBe("");
      expect(["foyer", "kitchen"]).toContain(touring.gameCamKey as string);

      setGameCamHold("kitchen", "Admin");
      const taken = await tickServerDirector();
      expect(taken.gameCamKey).toBe("kitchen");
      expect(taken.reason).toContain("took the Kitchen game cam");
      // Served state keeps the take's 2-minute clock, not the real-camera dwell.
      const served = await getServerDirectorState();
      expect(served.gameCamKey).toBe("kitchen");
      expect(served.dwellSecondsRemaining).toBeGreaterThan(100);
    } finally {
      clearGameCamHold();
      globalThis.__tankGameCamKeys = undefined;
      await tickServerDirector();
    }
  });

  test("ticks director autonomously and computes cuts based on server state", async () => {
    const tickedState = await tickServerDirector();

    expect(tickedState).toBeDefined();
    expect(tickedState.dwellSecondsRemaining).toBeGreaterThanOrEqual(0);
    expect(tickedState.reason).toBeDefined();
    expect(tickedState.switchedAt).toBeGreaterThan(0);
  });

  test("only the production Tank process directs the programme", () => {
    expect(shouldDirectProgramme({ NODE_ENV: "production", NEXT_PUBLIC_ZONE: "tank" })).toBe(true);
    // A dev container: same zone, not production. Must not run a second director.
    expect(shouldDirectProgramme({ NODE_ENV: "development", NEXT_PUBLIC_ZONE: "tank" })).toBe(false);
    expect(shouldDirectProgramme({ NODE_ENV: "development", NEXT_PUBLIC_ZONE: "tank", TANK_DIRECTOR_TICK: "1" })).toBe(true);
    expect(shouldDirectProgramme({ NODE_ENV: "production", NEXT_PUBLIC_ZONE: "shop" })).toBe(false);
    expect(shouldDirectProgramme({ NODE_ENV: "production", NEXT_PUBLIC_ZONE: "tank", NEXT_PHASE: "phase-production-build" })).toBe(false);
  });

  test("exposes proof that the process-owned Director worker is alive", async () => {
    // The test runner is not production, so the module does not self-start.
    startDirectorTicking();
    await tickServerDirector();
    const health = getServerDirectorWorkerHealth();

    expect(health.running).toBe(true);
    expect(health.intervalMs).toBe(3000);
    expect(health.tickCount).toBeGreaterThan(0);
    expect(health.lastTickStartedAt).toBeGreaterThan(0);
    expect(health.lastTickCompletedAt).toBeGreaterThanOrEqual(health.lastTickStartedAt ?? 0);
  });

  test("evaluates active chaos items and reflects activeChaosItem payload in director state", async () => {
    const { triggerChaosCatalogItem, clearItemOverride } = await import("./directorPolicyHierarchy");

    // Clear any previous
    clearItemOverride();

    // Trigger Chaos Cyclone
    const override = triggerChaosCatalogItem("chaos-cyclone", {
      triggeredBy: "TestViewer",
      durationSeconds: 30,
    });
    expect(override).not.toBeNull();
    expect(override?.itemSlug).toBe("chaos-cyclone");

    // Tick the director
    const state = await tickServerDirector();
    expect(state.activeChaosItem).toBeDefined();
    expect(state.activeChaosItem?.itemSlug).toBe("chaos-cyclone");
    expect(state.activeChaosItem?.overrideRoomLock).toBe(true);
    expect(state.activeChaosItem?.chaosHopIntervalMs).toBe(4500);
    // With nothing on air the chaos item is carried (it resumes the moment a
    // room comes back) but there is nothing to shuffle: the house is in GAME.
    expect(state.reason).toContain("[GAME]");

    // Clear the item
    clearItemOverride();
    const clearedState = await tickServerDirector();
    expect(clearedState.activeChaosItem).toBeNull();
  });
});

