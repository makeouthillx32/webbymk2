import { describe, expect, it } from "bun:test";
import {
  DAILY_CLAIM_COOLDOWN_MS,
  DAILY_STREAK_GRACE_MS,
  resolveDailyStreakWindow,
} from "./dailyStreakPolicy";

const START = Date.parse("2026-08-01T12:00:00.000Z");

describe("Tank daily streak window", () => {
  it("starts at base zero and allows a first claim", () => {
    expect(resolveDailyStreakWindow(null, 99, START)).toEqual({
      currentStreak: 0,
      canClaim: true,
      nextClaimAt: null,
      streakExpiresAt: null,
      secondsUntilClaim: 0,
    });
  });

  it("unlocks after 24 hours while preserving the active streak", () => {
    const state = resolveDailyStreakWindow(
      new Date(START).toISOString(),
      12,
      START + DAILY_CLAIM_COOLDOWN_MS,
    );
    expect(state.canClaim).toBe(true);
    expect(state.currentStreak).toBe(12);
  });

  it("resets to base zero after the 24-hour continuation window is missed", () => {
    const state = resolveDailyStreakWindow(
      new Date(START).toISOString(),
      12,
      START + DAILY_CLAIM_COOLDOWN_MS + DAILY_STREAK_GRACE_MS + 1,
    );
    expect(state.canClaim).toBe(true);
    expect(state.currentStreak).toBe(0);
  });
});
