const DAY_MS = 86_400_000;

/**
 * Returns the one-based public house day for a durable reset timestamp.
 * Season dates intentionally do not live here: resetting the public counter
 * must not rewrite archive or season history.
 */
export function calculateHouseDay(
  startedAt: string | null | undefined,
  now: Date,
): number | null {
  if (!startedAt) return null;

  const started = new Date(startedAt).getTime();
  const current = now.getTime();
  if (!Number.isFinite(started) || !Number.isFinite(current)) return null;

  return Math.max(1, Math.floor((current - started) / DAY_MS) + 1);
}
