// src/zones/tank/server/appearanceCaptureQueue.ts
// ─────────────────────────────────────────────────────────────────────────────
// The hand-off between "an operator asked to enrol someone" and "the worker
// captured what that person looks like".
//
// The two halves live in different processes for an unavoidable reason: the
// operator is in a browser, and the pixels are in the vision worker. A browser
// COULD compute a signature from its own <video> element, and that was the
// tempting shortcut — but the browser plays WHEP at full resolution through a
// completely different decode path from the worker's HLS-through-ffmpeg
// letterbox. The enrolment would be cut from different pixels than every
// subsequent comparison, which is precisely the way to build a roster that
// looks right and matches nothing.
//
// So the request travels instead of the image. It rides the telemetry response
// the worker is already polling several times a second, so no new socket, no
// new poll loop, and the operator waits well under a second.
//
// In-memory, like directorTelemetryStore next door, and for the same reason: a
// request is meaningful for a few seconds and meaningless after a restart. A
// pending capture that survived a redeploy would fire against whatever happened
// to be in frame minutes later, which is exactly the wrong kind of durability.
// ─────────────────────────────────────────────────────────────────────────────

import { getTargetBySlug } from "./detectionCatalog";

/**
 * How long a request stays claimable.
 *
 * Short on purpose. The operator's mental model is "I am standing here now" —
 * a capture that fires a minute later has no relationship to what they were
 * looking at when they clicked.
 */
export const CAPTURE_TTL_MS = 20_000;

export type CaptureRequest = {
  id: string;
  targetSlug: string;
  /** The detector class this target answers to — the roster the crop is cut for. */
  detectedClass: string;
  cameraId: string;
  mode?: "single" | "burst";
  burstDurationMs?: number;
  burstTargetCount?: number;
  note: string | null;
  requestedBy: string | null;
  requestedAt: number;
};

export type CaptureOutcome = {
  id: string;
  status: "captured" | "failed";
  /** Operator-facing explanation. The failures are the informative ones. */
  detail: string;
  capturedAt: number;
};

const pending = new Map<string, CaptureRequest>();
const outcomes = new Map<string, CaptureOutcome>();

/** Outcomes linger a little longer than requests so the UI can still read them. */
const OUTCOME_TTL_MS = 120_000;

function sweep(now: number): void {
  for (const [id, request] of pending) {
    if (now - request.requestedAt > CAPTURE_TTL_MS) {
      pending.delete(id);
      outcomes.set(id, {
        id,
        status: "failed",
        // Almost always means the worker is not running or is not watching that
        // camera. Saying so beats a request that just quietly vanishes.
        detail: "Expired before the worker claimed it — is tank-vision-worker watching this camera?",
        capturedAt: now,
      });
    }
  }
  for (const [id, outcome] of outcomes) {
    if (now - outcome.capturedAt > OUTCOME_TTL_MS) outcomes.delete(id);
  }
}

export type EnqueueResult =
  | { ok: true; request: CaptureRequest }
  | { ok: false; error: string };

/**
 * Queue a capture, rejecting anything the worker could not act on.
 *
 * The slug is validated against the catalog HERE rather than at write time,
 * because a bad slug that reaches the database produces an enrolment that is
 * loaded, counted, and never matched against anything — invisible in exactly
 * the way `the-foyer` vs `foyer` was.
 */
export function enqueueCapture(input: {
  targetSlug: string;
  cameraId: string;
  mode?: "single" | "burst";
  burstDurationMs?: number;
  burstTargetCount?: number;
  note?: string | null;
  requestedBy?: string | null;
  now?: number;
}): EnqueueResult {
  const now = input.now ?? Date.now();
  sweep(now);

  const targetSlug = input.targetSlug?.trim();
  const cameraId = input.cameraId?.trim();
  if (!targetSlug) return { ok: false, error: "targetSlug is required" };
  if (!cameraId) return { ok: false, error: "cameraId is required" };

  const target = getTargetBySlug(targetSlug);
  if (!target) {
    return { ok: false, error: `"${targetSlug}" is not in the detection catalog` };
  }
  const detectedClass = target.yoloClassIds[0];
  if (!detectedClass) {
    return { ok: false, error: `${target.displayName} answers to no detector class` };
  }

  // One outstanding request per person. Clicking enrol twice should refresh the
  // attempt, not queue two captures of two different frames under one name.
  for (const [id, existing] of pending) {
    if (existing.targetSlug === targetSlug) pending.delete(id);
  }

  const request: CaptureRequest = {
    id: `cap_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    targetSlug,
    detectedClass,
    cameraId,
    mode: input.mode ?? "single",
    burstDurationMs: input.burstDurationMs ?? (input.mode === "burst" ? 3000 : undefined),
    burstTargetCount: input.burstTargetCount ?? (input.mode === "burst" ? 5 : undefined),
    note: input.note?.trim() || null,
    requestedBy: input.requestedBy ?? null,
    requestedAt: now,
  };
  pending.set(request.id, request);
  return { ok: true, request };
}

/**
 * Hand every pending request to the worker, exactly once.
 *
 * Claiming removes them: a request the worker has taken must not be handed to a
 * second poll, or one click would enrol the same person several times from
 * several frames. If the worker crashes mid-capture the request is simply lost,
 * and the operator clicks again — the cheap failure.
 */
export function claimCaptures(now = Date.now()): CaptureRequest[] {
  sweep(now);
  const claimed = [...pending.values()];
  pending.clear();
  return claimed;
}

/** The worker reports back so the operator sees more than a spinner. */
export function recordOutcome(
  id: string,
  status: CaptureOutcome["status"],
  detail: string,
  now = Date.now(),
): void {
  sweep(now);
  outcomes.set(id, { id, status, detail, capturedAt: now });
}

export function describeCaptures(now = Date.now()) {
  sweep(now);
  return {
    pending: [...pending.values()].sort((a, b) => a.requestedAt - b.requestedAt),
    recent: [...outcomes.values()].sort((a, b) => b.capturedAt - a.capturedAt),
  };
}

/** Tests only — module state outlives a single test otherwise. */
export function __resetCaptureQueue(): void {
  pending.clear();
  outcomes.clear();
}
