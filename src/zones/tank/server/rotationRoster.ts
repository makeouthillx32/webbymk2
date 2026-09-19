// src/zones/tank/server/rotationRoster.ts
// ─────────────────────────────────────────────────────────────────────────────
// The rotation roster: which cameras the director cycles, and how long each
// one holds the shot.
//
// This exists because the roster used to live in React state inside the
// configurator. Two things followed from that, both of which an operator would
// reasonably call broken:
//
//   1. Setting a roster and refreshing the page lost it, because nothing ever
//      left the browser.
//   2. The server's rotation branch could not honour a roster it had never
//      been told about, so it cycled EVERY canvas camera on a hardcoded 12s
//      dwell — while the configurator's own box said 170 seconds.
//
// So the roster is durable server state now, and the engine reads it. The
// decision logic lives here, pure, because every interesting case is an edge
// case that only shows up on a live broadcast.
// ─────────────────────────────────────────────────────────────────────────────

export type RotationRoster = {
  /** Cameras to cycle, in the operator's chosen order. Empty means "all live". */
  cameraIds: string[];
  intervalMs: number;
};

/** Ten seconds is already a fast cut; anything less reads as a glitch. */
export const ROTATION_MIN_INTERVAL_MS = 10_000;
export const ROTATION_MAX_INTERVAL_MS = 600_000;
/** 2:50 — the operator's own stated dwell for spotlighting a couple of people. */
export const ROTATION_DEFAULT_INTERVAL_MS = 170_000;
/** A roster longer than this is a mis-paste, not a plan. */
export const ROTATION_MAX_CAMERAS = 24;

export const EMPTY_ROTATION_ROSTER: RotationRoster = {
  cameraIds: [],
  intervalMs: ROTATION_DEFAULT_INTERVAL_MS,
};

/**
 * Coerce anything — an HTTP body, a row out of the settings table — into a
 * roster that cannot break the engine.
 *
 * Deliberately total: it never throws and never returns a partial object,
 * because both callers sit on the path that decides what goes on air.
 */
export function sanitizeRotationRoster(input: unknown): RotationRoster {
  const raw = (input ?? {}) as { cameraIds?: unknown; intervalMs?: unknown };

  const seen = new Set<string>();
  const cameraIds: string[] = [];
  if (Array.isArray(raw.cameraIds)) {
    for (const entry of raw.cameraIds) {
      if (typeof entry !== "string") continue;
      const id = entry.trim();
      // Duplicates would make one camera hold the shot twice per lap, which
      // looks like the rotation is stuck rather than weighted.
      if (!id || seen.has(id)) continue;
      seen.add(id);
      cameraIds.push(id);
      if (cameraIds.length >= ROTATION_MAX_CAMERAS) break;
    }
  }

  const rawInterval = Number(raw.intervalMs);
  const intervalMs = Number.isFinite(rawInterval)
    ? Math.min(ROTATION_MAX_INTERVAL_MS, Math.max(ROTATION_MIN_INTERVAL_MS, Math.round(rawInterval)))
    : ROTATION_DEFAULT_INTERVAL_MS;

  return { cameraIds, intervalMs };
}

/**
 * The cameras the director will actually cycle.
 *
 * A roster names cameras that may since have gone offline. Rotating onto a
 * dead camera is a black programme, so they are dropped — but if that leaves
 * NOTHING, falling back to every live camera is the right answer. An empty
 * rotation would hold whatever was last on air indefinitely, which looks
 * exactly like a frozen director.
 */
export function resolveRotationOrder(
  roster: RotationRoster,
  availableCameraIds: readonly string[],
): string[] {
  const available = new Set(availableCameraIds);
  // Roster order is preserved, not the canvas order: an operator who put the
  // kitchen after the studio meant that.
  const picked = roster.cameraIds.filter((id) => available.has(id));
  return picked.length > 0 ? picked : [...availableCameraIds];
}

export type RotationSlot = {
  cameraId: string;
  /** True only when the shot actually changes — a held shot is not a cut. */
  moved: boolean;
  dwellSecondsRemaining: number;
};

/**
 * Decide which camera holds the shot right now.
 *
 * `heldMs` is how long the current camera has been up. Returns null only when
 * there is nothing to rotate at all, which the caller must treat as "leave the
 * programme alone".
 */
export function pickRotationSlot(input: {
  order: readonly string[];
  activeCameraId: string | null;
  heldMs: number;
  intervalMs: number;
}): RotationSlot | null {
  const { order, activeCameraId, heldMs, intervalMs } = input;
  if (order.length === 0) return null;

  const currentIndex = activeCameraId ? order.indexOf(activeCameraId) : -1;

  // The camera on air is not in the roster — the operator just changed it, or
  // the camera dropped off. Move NOW rather than serving out a dwell on a shot
  // that is no longer part of the plan; waiting is what made removing a camera
  // from the roster look like it had done nothing.
  if (currentIndex === -1) {
    return {
      cameraId: order[0],
      moved: true,
      dwellSecondsRemaining: Math.ceil(intervalMs / 1000),
    };
  }

  const due = heldMs >= intervalMs;
  const nextIndex = due ? (currentIndex + 1) % order.length : currentIndex;
  // A single-camera roster is a spotlight, not a rotation: it must hold, and
  // must not announce a cut to itself every interval.
  const moved = nextIndex !== currentIndex;

  return {
    cameraId: order[nextIndex],
    moved,
    dwellSecondsRemaining: Math.max(
      0,
      Math.ceil((intervalMs - (moved ? 0 : heldMs)) / 1000),
    ),
  };
}
