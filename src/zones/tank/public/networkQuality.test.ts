import { describe, expect, it, afterEach } from "bun:test";
import { detectNetworkProfile } from "./networkQuality";

// The whole point of this module is that a thin pipe gets patient numbers.
// These assert the specific values whose absence produced the cellular
// rebuffer loop, so a future "tidy up the constants" pass can't quietly
// reintroduce it.

function setConnection(conn: any) {
  (globalThis as any).navigator = conn === null ? {} : { connection: conn };
}

afterEach(() => {
  delete (globalThis as any).navigator;
});

describe("detectNetworkProfile", () => {
  it("treats an explicit data-saver preference as constrained", () => {
    setConnection({ saveData: true, effectiveType: "4g" });
    const p = detectNetworkProfile();
    expect(p.constrained).toBe(true);
    expect(p.saveData).toBe(true);
  });

  it("treats cellular as constrained even when it reports 4g", () => {
    setConnection({ type: "cellular", effectiveType: "4g" });
    expect(detectNetworkProfile().constrained).toBe(true);
  });

  it("treats 2g and 3g as constrained", () => {
    for (const effectiveType of ["slow-2g", "2g", "3g"]) {
      setConnection({ effectiveType });
      expect(detectNetworkProfile().constrained).toBe(true);
    }
  });

  it("leaves fast connections unconstrained so desktop is unchanged", () => {
    setConnection({ type: "wifi", effectiveType: "4g", downlink: 25 });
    const p = detectNetworkProfile();
    expect(p.constrained).toBe(false);
    expect(p.tier).toBe("fast");
    expect(p.preload).toBe("auto");
  });

  it("never snaps to within a second of live on a thin pipe", () => {
    // Landing 0.5s behind live is what guaranteed the next stall, which the
    // watchdog then treated as a freeze — the loop.
    setConnection({ effectiveType: "3g" });
    expect(detectNetworkProfile().liveEdgeTargetSeconds).toBeGreaterThanOrEqual(3);
  });

  it("gives a cellular WHEP handshake meaningfully longer than 3.5s", () => {
    setConnection({ type: "cellular" });
    expect(detectNetworkProfile().whepFirstFrameMs).toBeGreaterThan(3500);
  });

  it("limits a thin pipe to a single stream so the page itself can load", () => {
    setConnection({ type: "cellular" });
    expect(detectNetworkProfile().maxConcurrentStreams).toBe(1);
  });

  it("stays patient when the browser reports nothing, but does not claim to know", () => {
    // Safari and Firefox expose no connection API, so most iPhones land here.
    // Guessing "fast" is what broke them.
    setConnection(null);
    const p = detectNetworkProfile();
    expect(p.tier).toBe("unknown");
    expect(p.liveEdgeTargetSeconds).toBeGreaterThan(0.5);
    expect(p.maxConcurrentStreams).toBeLessThan(8);
  });
});
