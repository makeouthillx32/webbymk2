import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  warmupServerDirector,
  getServerDirectorState,
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
    expect(["STANDBY", "AUTO_TRACKING", "ATTENTION", "MANUAL_PILOT"]).toContain(
      warmedState.mode,
    );
    expect(warmedState.updatedAt).toBeGreaterThan(0);
  });

  test("serves warm director state instantly without cold-start delay", async () => {
    const startTime = Date.now();
    const state = await getServerDirectorState();
    const duration = Date.now() - startTime;

    expect(state).toBeDefined();
    expect(state.activeCameraId.length).toBeGreaterThan(0);
    // Should return fast from pre-warmed memory
    expect(duration).toBeLessThan(100);
  });

  test("ticks director autonomously and computes cuts based on server state", async () => {
    const tickedState = await tickServerDirector();

    expect(tickedState).toBeDefined();
    expect(tickedState.dwellSecondsRemaining).toBeGreaterThanOrEqual(0);
    expect(tickedState.reason).toBeDefined();
    expect(tickedState.switchedAt).toBeGreaterThan(0);
  });
});
