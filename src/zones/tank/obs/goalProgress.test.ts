import { describe, expect, test } from "bun:test";
import {
  isSourceAvailable,
  isSourceMeasurable,
  pickActiveGoal,
  resolveGoalProgress,
  type StreamGoal,
} from "./goalProgress";

// Every case here renders on a live broadcast, so "roughly right" is not a
// passing grade — a NaN width is an invisible bar, and a bar that drops to zero
// because one count failed looks like a broken feature rather than a quiet one.

const goal = (over: Partial<StreamGoal> = {}): StreamGoal => ({
  id: "g1",
  label: "Follower goal",
  source: "manual",
  sourceProvider: null,
  target: 254,
  currentValue: 243,
  accentColor: "#f59e0b",
  showCount: true,
  ...over,
});

describe("drawing the bar", () => {
  test("a normal goal reports its real proportion", () => {
    const p = resolveGoalProgress(goal());
    expect(p.current).toBe(243);
    expect(p.target).toBe(254);
    expect(p.percent).toBeCloseTo(95.7, 1);
    expect(p.complete).toBe(false);
    expect(p.remaining).toBe(11);
  });

  test("a met goal is complete with nothing remaining", () => {
    const p = resolveGoalProgress(goal({ currentValue: 254 }));
    expect(p.complete).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  test("overshooting fills the bar without spilling past it", () => {
    // Blowing past a goal is a success, not a bar wider than its container.
    // The real number is still shown next to it.
    const p = resolveGoalProgress(goal({ currentValue: 999 }));
    expect(p.percent).toBe(100);
    expect(p.current).toBe(999);
    expect(p.complete).toBe(true);
  });

  test("a zero target cannot produce NaN%", () => {
    // NaN width renders as an invisible bar, which reads as "the overlay is
    // broken" rather than "somebody typed 0".
    const p = resolveGoalProgress(goal({ target: 0 }));
    expect(Number.isFinite(p.percent)).toBe(true);
    expect(p.target).toBeGreaterThan(0);
  });

  test("a negative count is floored at zero", () => {
    expect(resolveGoalProgress(goal({ currentValue: -50 })).current).toBe(0);
  });
});

describe("computed sources", () => {
  test("a live measurement wins over the stored value", () => {
    const p = resolveGoalProgress(goal({ source: "viewers", currentValue: 5 }), 42);
    expect(p.current).toBe(42);
  });

  test("a failed measurement HOLDS the last known value", () => {
    // The important one. A bar that freezes at its last number is far better on
    // air than one that drops to zero because a count failed once.
    const p = resolveGoalProgress(goal({ source: "viewers", currentValue: 37 }), null);
    expect(p.current).toBe(37);
  });

  test("a manual goal ignores any live value entirely", () => {
    // Manual means a person typed it. Nothing should quietly overwrite that.
    const p = resolveGoalProgress(goal({ source: "manual", currentValue: 243 }), 9999);
    expect(p.current).toBe(243);
  });

  test("NaN from a broken source does not become the count", () => {
    const p = resolveGoalProgress(goal({ source: "drops", currentValue: 12 }), Number.NaN);
    expect(p.current).toBe(12);
  });
});

describe("which sources can actually report today", () => {
  test("manual and viewers work with nothing connected", () => {
    expect(isSourceAvailable("manual")).toBe(true);
    expect(isSourceAvailable("viewers")).toBe(true);
    expect(isSourceAvailable("drops")).toBe(true);
  });

  test("connected is not the same as countable", () => {
    // The trap: Twitch, Kick and YouTube are all connected, so a follower goal
    // passes the provider test — but nothing in Tank fetches a follower count,
    // so the bar cannot move. The console must warn on THIS, not on the other.
    expect(isSourceAvailable("followers", ["twitch", "kick", "youtube"])).toBe(true);
    expect(isSourceMeasurable("followers")).toBe(false);
  });

  test("everything Tank can actually count is marked measurable", () => {
    expect(isSourceMeasurable("manual")).toBe(true);
    expect(isSourceMeasurable("viewers")).toBe(true);
    expect(isSourceMeasurable("drops")).toBe(true);
    expect(isSourceMeasurable("tavern")).toBe(true);
  });

  test("followers needs a connected provider", () => {
    // No provider is configured, so a follower goal would read 0 forever and
    // look broken. The console uses this to say so instead.
    expect(isSourceAvailable("followers", [])).toBe(false);
    expect(isSourceAvailable("followers", ["twitch"])).toBe(true);
  });
});

describe("choosing what goes on air", () => {
  const g = (isActive: boolean, sortOrder: number, id: string) => ({ isActive, sortOrder, id });

  test("the lowest sort order among active goals wins", () => {
    expect(pickActiveGoal([g(true, 5, "b"), g(true, 1, "a")])?.id).toBe("a");
  });

  test("inactive goals are never chosen", () => {
    expect(pickActiveGoal([g(false, 0, "off"), g(true, 9, "on")])?.id).toBe("on");
  });

  test("nothing active means nothing on air", () => {
    // The overlay must render empty, not fall back to an arbitrary goal.
    expect(pickActiveGoal([g(false, 0, "a"), g(false, 1, "b")])).toBeNull();
    expect(pickActiveGoal([])).toBeNull();
  });
});

describe("presentation guards", () => {
  test("a malformed colour falls back rather than breaking the style", () => {
    expect(resolveGoalProgress(goal({ accentColor: "javascript:alert(1)" })).accentColor).toBe(
      "#f59e0b",
    );
    expect(resolveGoalProgress(goal({ accentColor: "#0af" })).accentColor).toBe("#0af");
  });

  test("an empty label still prints something", () => {
    expect(resolveGoalProgress(goal({ label: "   " })).label).toBe("Goal");
  });
});
