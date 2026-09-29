// src/zones/tank/obs/buildReload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Making an OBS browser source pick up a new build by itself.
//
// THE CHORE THIS REMOVES. Every Tank rebuild leaves every browser source
// running the previous bundle until somebody right-clicks each one in OBS and
// picks "Refresh cache of current page". Forget it and the source keeps serving
// stale JS — which is exactly how a verify screen sat there all morning with
// server actions keyed to a dead build, silently failing.
//
// The decision is pure so the dangerous parts can be tested: a browser source
// is a live broadcast layer, and a reload at the wrong moment is a black frame
// in front of an audience. The rules that matter:
//
//   · Never reload on the FIRST reading. There is nothing to compare it to, and
//     a source that reloads the moment it loads is an infinite loop.
//   · Only reload when the id genuinely CHANGES. Not on a fetch failure, not on
//     an empty body, not on a malformed response — a flaky network must never
//     be able to restart the programme source.
//   · Stagger. Six overlays on one scene that all reload on the same tick take
//     the whole scene down together; spread out, they blink one at a time.
// ─────────────────────────────────────────────────────────────────────────────

export type BuildReloadState = {
  /** The build id this page started with, once known. */
  seen: string | null;
};

export type BuildReloadDecision =
  | { action: "ignore"; reason: "no-reading" | "unchanged" | "first-reading" }
  | { action: "adopt"; buildId: string }
  | { action: "reload"; from: string; to: string };

/**
 * What to do with a freshly polled build id.
 *
 * `incoming` is whatever the endpoint returned — including null when the fetch
 * failed, which must be indistinguishable from "do nothing".
 */
export function decideBuildReload(
  state: BuildReloadState,
  incoming: string | null | undefined,
): BuildReloadDecision {
  const next = typeof incoming === "string" ? incoming.trim() : "";
  // A failed poll is silence, never a signal. Reloading on a transient 502
  // would turn a blip in the app into a blink on air.
  if (!next) return { action: "ignore", reason: "no-reading" };

  if (state.seen === null) return { action: "adopt", buildId: next };
  if (state.seen === next) return { action: "ignore", reason: "unchanged" };

  return { action: "reload", from: state.seen, to: next };
}

/**
 * How long to wait before actually reloading.
 *
 * Spread across a window so a scene full of overlays does not go dark at once.
 * Deterministic given `random`, so the spread itself is testable.
 */
export function reloadDelayMs(
  random: number = Math.random(),
  windowMs: number = BUILD_RELOAD_STAGGER_MS,
): number {
  const r = Number.isFinite(random) ? Math.min(Math.max(random, 0), 1) : 0;
  return Math.round(r * windowMs);
}

/** Poll cadence. Slow on purpose — a deploy is not a per-second event. */
export const BUILD_POLL_INTERVAL_MS = 20_000;

/**
 * Reload spread. Long enough that overlays blink separately, short enough that
 * an operator who just deployed sees the change without wondering.
 */
export const BUILD_RELOAD_STAGGER_MS = 8_000;
