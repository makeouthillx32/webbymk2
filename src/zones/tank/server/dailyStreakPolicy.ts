export const DAILY_CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DAILY_STREAK_GRACE_MS = 24 * 60 * 60 * 1000;

export type DailyStreakWindow = {
  currentStreak: number;
  canClaim: boolean;
  nextClaimAt: string | null;
  streakExpiresAt: string | null;
  secondsUntilClaim: number;
};

export function resolveDailyStreakWindow(
  lastClaimAt: string | null | undefined,
  storedStreak: number,
  nowMs = Date.now(),
): DailyStreakWindow {
  const parsedLastClaim = lastClaimAt ? new Date(lastClaimAt).getTime() : Number.NaN;
  if (!Number.isFinite(parsedLastClaim)) {
    return {
      currentStreak: 0,
      canClaim: true,
      nextClaimAt: null,
      streakExpiresAt: null,
      secondsUntilClaim: 0,
    };
  }

  const nextClaimMs = parsedLastClaim + DAILY_CLAIM_COOLDOWN_MS;
  const expiresMs = nextClaimMs + DAILY_STREAK_GRACE_MS;
  const expired = nowMs > expiresMs;

  return {
    currentStreak: expired ? 0 : Math.max(0, Math.trunc(storedStreak)),
    canClaim: nowMs >= nextClaimMs,
    nextClaimAt: new Date(nextClaimMs).toISOString(),
    streakExpiresAt: new Date(expiresMs).toISOString(),
    secondsUntilClaim: Math.max(0, Math.ceil((nextClaimMs - nowMs) / 1000)),
  };
}
