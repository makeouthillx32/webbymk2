// src/zones/tank/vision/calibration.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-camera floor calibration: the record, and how to make one.
//
// A camera is calibrated once someone has told us four points that appear both
// in its picture and on the floor of the house. Until then it is uncalibrated,
// and that is the normal state — all six cameras are uncalibrated right now.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: an uncalibrated camera must keep
// working exactly as it does today. Detection, the director, the matrix, the
// overlay — none of it may depend on calibration existing. Floor tracking is an
// upgrade layered on top for the cameras that have it, never a prerequisite.
// Anything else would mean shipping this turns off the house.
// ─────────────────────────────────────────────────────────────────────────────

import {
  applyHomography,
  groundContactPoint,
  solveHomography,
  type Correspondence,
  type Homography,
  type Point2,
} from "./homography";

export type CameraCalibration = {
  cameraId: string;
  /** Which room's floor plane these floor coordinates belong to. */
  roomScope: string;
  /** image (normalised 0..1) -> floor (metres). */
  homography: Homography;
  /** Kept so the matrix can be re-derived, audited, or re-fitted later. */
  correspondences: readonly Correspondence[];
  /**
   * Free-text note from whoever measured it — "corners of the rug",
   * "doorframe + TV stand". Calibration rots when the furniture moves, and the
   * only way anyone will ever know is if they can read what was measured.
   */
  reference?: string;
  calibratedAt: string;
};

/**
 * Are two cameras' floor coordinates comparable?
 *
 * Only within a room, for now. Each room is calibrated to its own floor plane
 * with its own origin, so "2.1 metres" in the kitchen and "2.1 metres" in the
 * foyer are unrelated numbers. Comparing across rooms needs a house-level frame
 * (one origin, rooms placed relative to it), which is a later step and a survey
 * job, not a code change.
 *
 * Getting this wrong is how a tracker starts teleporting people between rooms,
 * so it is a function rather than an assumption sprinkled at call sites.
 */
export function sharesFloorFrame(a: CameraCalibration, b: CameraCalibration): boolean {
  return a.roomScope === b.roomScope;
}

export type CalibrationResult =
  | { ok: true; calibration: CameraCalibration }
  | { ok: false; error: string };

/**
 * Build a calibration from four measured correspondences.
 *
 * Returns a reason rather than throwing, because the caller is an operator
 * clicking points on a video still and they need to be told what went wrong —
 * "those four points are in a straight line" is actionable, an exception is not.
 */
export function buildCalibration(input: {
  cameraId: string;
  roomScope: string;
  correspondences: readonly Correspondence[];
  reference?: string;
  now?: () => Date;
}): CalibrationResult {
  const { cameraId, roomScope, correspondences, reference } = input;

  if (!cameraId.trim()) return { ok: false, error: "cameraId is required." };
  if (!roomScope.trim()) return { ok: false, error: "roomScope is required." };
  if (correspondences.length !== 4) {
    return { ok: false, error: `Exactly 4 points are required, got ${correspondences.length}.` };
  }

  for (const [i, c] of correspondences.entries()) {
    if (c.image.x < -0.5 || c.image.x > 1.5 || c.image.y < -0.5 || c.image.y > 1.5) {
      return {
        ok: false,
        error: `Point ${i + 1} is not in normalised image space (expected roughly 0..1, got ${c.image.x}, ${c.image.y}).`,
      };
    }
  }

  const homography = solveHomography(correspondences);
  if (!homography) {
    return {
      ok: false,
      error:
        "Those four points do not define a plane — they are collinear, duplicated, or otherwise degenerate. Pick four points that form a quadrilateral on the floor, such as the corners of a rug.",
    };
  }

  return {
    ok: true,
    calibration: {
      cameraId,
      roomScope,
      homography,
      correspondences: [...correspondences],
      reference,
      calibratedAt: (input.now?.() ?? new Date()).toISOString(),
    },
  };
}

/**
 * Where on the floor is this detection?
 *
 * Returns null for an uncalibrated camera, a horizon point, or a box that
 * projects nowhere real. Callers must treat null as "no floor position" and
 * fall back to per-camera behaviour — never as (0, 0), which would pile every
 * unknown detection onto the origin and make them look like one person.
 */
export function locateDetection(
  calibration: CameraCalibration | undefined,
  box: { nx: number; ny: number; nw: number; nh: number },
): Point2 | null {
  if (!calibration) return null;
  return applyHomography(calibration.homography, groundContactPoint(box));
}

/** Simple in-memory lookup. The DB-backed version can implement the same shape. */
export class CalibrationSet {
  private readonly byCamera = new Map<string, CameraCalibration>();

  constructor(calibrations: readonly CameraCalibration[] = []) {
    for (const c of calibrations) this.byCamera.set(c.cameraId, c);
  }

  get(cameraId: string): CameraCalibration | undefined {
    return this.byCamera.get(cameraId);
  }

  has(cameraId: string): boolean {
    return this.byCamera.has(cameraId);
  }

  set(calibration: CameraCalibration): void {
    this.byCamera.set(calibration.cameraId, calibration);
  }

  /** Cameras that can contribute floor positions. */
  calibratedCameraIds(): string[] {
    return [...this.byCamera.keys()].sort();
  }

  /**
   * Coverage report for the operator console: who is calibrated, who is not.
   * Expected to read "0 of 6" until someone does the measuring.
   */
  describeCoverage(allCameraIds: readonly string[]): {
    calibrated: string[];
    uncalibrated: string[];
    summary: string;
  } {
    const calibrated = allCameraIds.filter((id) => this.byCamera.has(id));
    const uncalibrated = allCameraIds.filter((id) => !this.byCamera.has(id));
    return {
      calibrated,
      uncalibrated,
      summary: `${calibrated.length} of ${allCameraIds.length} cameras calibrated`,
    };
  }
}
