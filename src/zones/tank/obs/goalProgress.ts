// src/zones/tank/obs/goalProgress.ts
// ─────────────────────────────────────────────────────────────────────────────
// Turning a stored goal into something a bar can draw.
//
// Pure, because every interesting case here is an edge case and all of them end
// up on a live broadcast: a goal that was met, a goal that was overshot, a
// source that cannot report yet, a target someone typed as zero. Each one has a
// right answer that is easy to get wrong by one character.
// ─────────────────────────────────────────────────────────────────────────────

export type GoalSource = "manual" | "viewers" | "followers" | "drops" | "tavern";

export type StreamGoal = {
  id: string;
  label: string;
  source: GoalSource;
  sourceProvider: string | null;
  target: number;
  currentValue: number;
  accentColor: string;
  showCount: boolean;
};

export type GoalProgress = {
  label: string;
  current: number;
  target: number;
  /** 0-100, clamped. What the bar fills to. */
  percent: number;
  /** True once the goal is met — the bar is full and should read as achieved. */
  complete: boolean;
  /** How many more are needed. 0 once met, never negative. */
  remaining: number;
  accentColor: string;
  showCount: boolean;
};

/**
 * Sources Tank can answer WITHOUT any streaming platform connected.
 *
 * `followers` is the goal everyone actually wants and the one number Tank
 * cannot currently produce — it needs Twitch/Kick/YouTube OAuth, and no
 * provider is connected. A follower goal therefore resolves to whatever was
 * last stored rather than silently reading zero, which would put a bar showing
 * "0 / 254" on air and look like the feature is broken rather than unconfigured.
 */
export const SELF_SUFFICIENT_SOURCES: readonly GoalSource[] = [
  "manual",
  "viewers",
  "drops",
  "tavern",
];

/**
 * Sources the SERVER can actually measure right now.
 *
 * Deliberately separate from isSourceAvailable, which only asks whether a
 * platform is connected. The two came apart the moment Twitch, Kick and
 * YouTube were connected: a follower goal now passes the "provider connected"
 * test while nothing in Tank fetches a follower count, so the console would
 * have called it healthy and the bar would have sat still with no explanation.
 *
 * Add "followers" here in the same commit that teaches the goals route to
 * fetch it — never before.
 */
export const MEASURABLE_SOURCES: readonly GoalSource[] = [
  "manual",
  "viewers",
  "drops",
  "tavern",
];

/** Can Tank put a real number on this goal today, whatever is connected? */
export function isSourceMeasurable(source: GoalSource): boolean {
  return MEASURABLE_SOURCES.includes(source);
}

export function isSourceAvailable(
  source: GoalSource,
  connectedProviders: readonly string[] = [],
): boolean {
  if (SELF_SUFFICIENT_SOURCES.includes(source)) return true;
  return connectedProviders.length > 0;
}

/**
 * Resolve a goal for rendering.
 *
 * `liveValue` is whatever the server measured for a computed source this tick.
 * Passing null means "could not measure", which falls back to the stored value
 * — a bar that freezes at its last known number is far better on air than one
 * that drops to zero because a count failed once.
 */
export function resolveGoalProgress(
  goal: StreamGoal,
  liveValue: number | null = null,
): GoalProgress {
  // A zero or negative target would divide by zero and render NaN% — and a
  // NaN width is an invisible bar, so it would look like the overlay was
  // broken rather than misconfigured. The DB constrains this too; belt and
  // braces, because this also runs on values that arrived over HTTP.
  const target = Number.isFinite(goal.target) && goal.target > 0 ? Math.round(goal.target) : 1;

  const measured =
    goal.source === "manual"
      ? goal.currentValue
      : typeof liveValue === "number" && Number.isFinite(liveValue)
        ? liveValue
        : goal.currentValue;

  const current = Math.max(0, Math.round(Number.isFinite(measured) ? measured : 0));

  // Clamped to 100: overshooting a goal is a success, not a bar spilling out of
  // its own container. The real count is still shown beside it.
  const percent = Math.min(100, Math.max(0, (current / target) * 100));

  return {
    label: goal.label?.trim() || "Goal",
    current,
    target,
    percent: Math.round(percent * 10) / 10,
    complete: current >= target,
    remaining: Math.max(0, target - current),
    accentColor: /^#[0-9a-f]{3,8}$/i.test(goal.accentColor) ? goal.accentColor : "#f59e0b",
    showCount: goal.showCount !== false,
  };
}

/** Which goal is on air when several are active: lowest sort order wins. */
export function pickActiveGoal<T extends { isActive: boolean; sortOrder: number }>(
  goals: readonly T[],
): T | null {
  const active = goals.filter((goal) => goal.isActive);
  if (active.length === 0) return null;
  return [...active].sort((a, b) => a.sortOrder - b.sortOrder)[0];
}
