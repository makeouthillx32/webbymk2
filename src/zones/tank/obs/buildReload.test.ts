import { describe, expect, test } from "bun:test";
import {
  BUILD_RELOAD_STAGGER_MS,
  decideBuildReload,
  reloadDelayMs,
  type BuildReloadState,
} from "./buildReload";

// This decides when a live broadcast layer restarts itself. Every wrong "yes"
// here is a black frame in front of an audience, and a wrong yes that repeats
// is a source that never stays up at all.

const fresh = (): BuildReloadState => ({ seen: null });
const running = (id: string): BuildReloadState => ({ seen: id });

describe("the first reading is never a reload", () => {
  test("a fresh page adopts the id instead of reloading", () => {
    // A source that reloads the moment it loads is an infinite loop that never
    // shows a picture.
    expect(decideBuildReload(fresh(), "build-a")).toEqual({
      action: "adopt",
      buildId: "build-a",
    });
  });

  test("adopting happens once, then it settles", () => {
    const first = decideBuildReload(fresh(), "build-a");
    expect(first.action).toBe("adopt");
    expect(decideBuildReload(running("build-a"), "build-a")).toEqual({
      action: "ignore",
      reason: "unchanged",
    });
  });
});

describe("a failed poll is silence, not a signal", () => {
  test("null, undefined and empty never reload", () => {
    // A transient 502 during a deploy must not become a blink on air.
    for (const bad of [null, undefined, "", "   "]) {
      expect(decideBuildReload(running("build-a"), bad)).toEqual({
        action: "ignore",
        reason: "no-reading",
      });
    }
  });

  test("a non-string body never reloads", () => {
    expect(decideBuildReload(running("build-a"), 42 as unknown as string).action).toBe("ignore");
    expect(decideBuildReload(running("build-a"), {} as unknown as string).action).toBe("ignore");
  });

  test("a failed poll on a fresh page does not adopt garbage", () => {
    expect(decideBuildReload(fresh(), null)).toEqual({
      action: "ignore",
      reason: "no-reading",
    });
  });
});

describe("a real deploy reloads exactly once", () => {
  test("a changed id reloads and names both sides", () => {
    expect(decideBuildReload(running("build-a"), "build-b")).toEqual({
      action: "reload",
      from: "build-a",
      to: "build-b",
    });
  });

  test("whitespace around the id is not a new build", () => {
    // Otherwise a proxy that pads the body restarts every source every poll.
    expect(decideBuildReload(running("build-a"), "  build-a  ")).toEqual({
      action: "ignore",
      reason: "unchanged",
    });
  });
});

describe("overlays do not all go dark together", () => {
  test("the delay spreads across the window", () => {
    expect(reloadDelayMs(0)).toBe(0);
    expect(reloadDelayMs(1)).toBe(BUILD_RELOAD_STAGGER_MS);
    expect(reloadDelayMs(0.5)).toBe(Math.round(BUILD_RELOAD_STAGGER_MS / 2));
  });

  test("a nonsense random still yields a usable delay", () => {
    for (const r of [Number.NaN, -5, 99]) {
      const delay = reloadDelayMs(r);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(BUILD_RELOAD_STAGGER_MS);
    }
  });
});
