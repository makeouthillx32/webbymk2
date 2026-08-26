import { afterEach, describe, expect, test } from "bun:test";
import { detectNetworkProfile } from "./networkQuality";

// The iPhone case, which is the one that broke: Safari exposes no Network
// Information API, so every iPhone lands on the "unknown" profile. If that
// profile's cap is below the number of tiles on screen, the surplus tiles wait
// for a slot that never frees — there is no rotation — and sit on
// "Tap to watch" forever on a perfectly good wifi connection.

afterEach(() => { delete (globalThis as any).navigator; });

describe("unknown-connection devices (iPhone Safari)", () => {
  test("an absent Network Information API is reported as unknown, not fast", () => {
    (globalThis as any).navigator = {};
    const p = detectNetworkProfile();
    expect(p.tier).toBe("unknown");
  });

  test("unknown is not treated as constrained, so it may ramp without a ceiling", () => {
    // constrained=true would pin a hard ceiling and strand the extra tiles.
    // An unmeasured connection must be allowed to reach every tile.
    (globalThis as any).navigator = {};
    expect(detectNetworkProfile().constrained).toBe(false);
  });

  test("a measured thin connection stays constrained and keeps its ceiling", () => {
    (globalThis as any).navigator = { connection: { type: "cellular", effectiveType: "3g" } };
    const p = detectNetworkProfile();
    expect(p.constrained).toBe(true);
    expect(p.maxConcurrentStreams).toBe(1);
  });

  test("the starting cap is below a full room grid, so ramping is required", () => {
    // 7 tiles + hero. If this ever equals or exceeds that, the ramp is dead
    // code and this test should be revisited rather than deleted.
    (globalThis as any).navigator = {};
    expect(detectNetworkProfile().maxConcurrentStreams).toBeLessThan(8);
  });
});
