// src/zones/tank/vision/floorTracker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Durable identity across cameras and across time.
//
// The decoder is stateless and per-frame; motion.ts adds velocity but only
// within one camera, by nearest-centre matching in image space. Neither can
// answer "is the person now in the living room the one who was just in the
// foyer" — the foyer track simply ends and a living-room track begins.
//
// This holds tracks in FLOOR space instead. A detection is projected to the
// floor through its camera's homography, and matched against existing tracks by
// real distance. Two cameras seeing the same person produce two detections that
// land in the same place, so they join the same track. One camera losing the
// person while another picks them up is a handover, not a death.
//
// DEGRADES, NEVER BLOCKS. An uncalibrated camera has no floor position, so its
// detections are tracked per-camera in image space exactly as before. Every
// camera is uncalibrated today; this must be an upgrade for the ones that get
// measured, not a precondition for detection working at all.
// ─────────────────────────────────────────────────────────────────────────────

import type { Point2 } from "./homography";
import { locateDetection, sharesFloorFrame, type CameraCalibration } from "./calibration";
import { isDetectionInPortal, type RoomPortal } from "./portalGeometry";

/**
 * Floor matching is gated on plausible SPEED, not a fixed distance.
 *
 * A fixed radius is the trap motion.ts already documents: pick 1.2 m and a
 * walking person breaks it. They move ~1.4 m/s, the worker captures at 1 fps by
 * default, so consecutive observations are routinely ~1.5 m apart — matching
 * would fail exactly when someone is walking, which is the case that matters.
 *
 * So the radius grows with the gap since the track was last seen: how far could
 * this person plausibly have gone? Floored for jitter when standing still, and
 * capped so a long occlusion cannot match someone on the far side of the house.
 */
/** Brisk indoor movement. Above this it is not the same person, it is two. */
export const MAX_PLAUSIBLE_SPEED_MPS = 2.5;
/** Detection jitter on a stationary subject. */
export const MIN_FLOOR_MATCH_RADIUS_M = 0.6;
/** Ceiling regardless of gap — beyond this, identity is a guess. */
export const MAX_FLOOR_MATCH_RADIUS_M = 4;

/** How far a track could plausibly have travelled in `dtMs`. */
export function floorMatchRadius(dtMs: number): number {
  const seconds = Math.max(0, dtMs) / 1000;
  return Math.min(
    MAX_FLOOR_MATCH_RADIUS_M,
    Math.max(MIN_FLOOR_MATCH_RADIUS_M, MAX_PLAUSIBLE_SPEED_MPS * seconds),
  );
}
/**
 * How long a track survives with no observation before it is dropped.
 *
 * Generous on purpose — this is what carries someone through a doorway, behind
 * a sofa, or across the gap between two cameras' coverage. Too short and every
 * occlusion mints a new identity, which is the failure this module exists to
 * prevent.
 */
export const TRACK_TTL_MS = 5_000;
/** Normalised image units, for the uncalibrated fallback. Mirrors motion.ts. */
export const IMAGE_MATCH_RADIUS = 0.25;

export type TrackClass = "person" | "cat" | "dog" | string;

/**
 * Resident anthropometric baselines (cm) used as an invariant gate.
 * Rejects impossible handovers (e.g. 188cm Joe matching a 162cm observation).
 */
export const RESIDENT_HEIGHTS_CM: Record<string, number> = {
  tyler: 178,
  joe: 188,
  malia: 162,
};

export const DEFAULT_HEIGHT_TOLERANCE_CM = 18;

export function isHeightCompatible(
  candidateHeightCm: number,
  expectedHeightCm: number,
  toleranceCm = DEFAULT_HEIGHT_TOLERANCE_CM,
): boolean {
  return Math.abs(candidateHeightCm - expectedHeightCm) <= toleranceCm;
}

export type DoorwayHandover = {
  targetName: string;
  label: TrackClass;
  sourceRoomSlug: string;
  targetRoomSlug: string;
  portalId: string;
  sourceTrackId: string;
  timestamp: number;
  expiresAt: number;
  expectedHeightCm?: number;
};

export type Observation = {
  cameraId: string;
  roomScope: string;
  label: TrackClass;
  confidence: number;
  /** Normalised box, as the decoder emits it. */
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  /** Set by resolveDetection when the room narrows it to one individual. */
  targetName?: string;
  /** Estimated physical height in cm, if known or computed. */
  estimatedHeightCm?: number;
};

export type Track = {
  id: string;
  label: TrackClass;
  /** Best individual name seen on this track so far, if any. */
  targetName?: string;
  /** Floor position in metres, when the observing camera is calibrated. */
  floor: Point2 | null;
  /** The frame `floor` belongs to. Null for image-space tracks. */
  floorFrame: string | null;
  /** Last image-space contact point, used for the uncalibrated fallback. */
  image: Point2;
  cameraId: string;
  roomScope: string;
  confidence: number;
  firstSeenAt: number;
  lastSeenAt: number;
  /** How many frames this track has been observed — a proxy for how real it is. */
  observations: number;
  /** Distinct cameras that have contributed to this track. */
  cameraIds: string[];
  /** Estimated physical height in cm if available. */
  estimatedHeightCm?: number;
};

export type TrackerOptions = {
  /** Override the speed gate; mostly for tests. */
  maxSpeedMps?: number;
  imageMatchRadius?: number;
  trackTtlMs?: number;
  /** Injected for tests; defaults to an incrementing id. */
  makeId?: () => string;
  /** Room doorways / portals for cross-room spatial-temporal identity handover. */
  portals?: readonly RoomPortal[];
  /** Window during which an identity can transition through a portal into the target room (ms). Defaults to 5000. */
  handoverWindowMs?: number;
};

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Holds tracks between frames.
 *
 * Deliberately a class with explicit `update(observations, now)` rather than
 * anything timer-driven: the worker already has a loop, and a pure
 * observations-in/tracks-out step is testable without faking clocks.
 */
export class FloorTracker {
  private tracks = new Map<string, Track>();
  private sequence = 0;
  private readonly maxSpeed: number;
  private readonly imageRadius: number;
  private readonly ttlMs: number;
  private readonly makeId: () => string;
  private readonly portals: readonly RoomPortal[];
  private readonly handoverWindowMs: number;
  private pendingHandovers: DoorwayHandover[] = [];

  constructor(
    private readonly calibrations: { get(cameraId: string): CameraCalibration | undefined },
    options: TrackerOptions = {},
  ) {
    this.maxSpeed = options.maxSpeedMps ?? MAX_PLAUSIBLE_SPEED_MPS;
    this.imageRadius = options.imageMatchRadius ?? IMAGE_MATCH_RADIUS;
    this.ttlMs = options.trackTtlMs ?? TRACK_TTL_MS;
    this.makeId = options.makeId ?? (() => `track-${++this.sequence}`);
    this.portals = options.portals ?? [];
    this.handoverWindowMs = options.handoverWindowMs ?? 5_000;
  }

  /**
   * Fold one frame's observations (from ALL cameras) into the track set.
   *
   * Must be called with every camera's detections for the moment, not one
   * camera at a time — cross-camera matching is the entire point, and feeding
   * cameras separately would make each one's detections match only their own
   * tracks.
   */
  update(observations: readonly Observation[], now: number): Track[] {
    this.expire(now);

    // trackId -> cameras that already contributed to it THIS frame.
    //
    // Not a plain Set of track ids. Two detections from the SAME camera must
    // not collapse into one track (that is two people standing near each
    // other), but two detections from DIFFERENT cameras landing on the same
    // floor position are the overlap case this module exists for — one person
    // seen twice. Blocking those was making every handover mint a second id.
    const claimed = new Map<string, Set<string>>();

    // Strongest detections first: a confident observation should get its pick
    // of tracks before a marginal one takes the same id.
    const ordered = [...observations].sort((a, b) => b.confidence - a.confidence);

    for (const obs of ordered) {
      const calibration = this.calibrations.get(obs.cameraId);
      const floor = locateDetection(calibration, obs);
      const image = { x: obs.nx + obs.nw / 2, y: obs.ny + obs.nh };

      const match = this.findMatch(obs, floor, calibration, image, claimed, now);

      if (match) {
        const corroboration = claimed.has(match.id);
        const cameras = claimed.get(match.id) ?? new Set<string>();
        cameras.add(obs.cameraId);
        claimed.set(match.id, cameras);

        match.lastSeenAt = now;
        // A second camera confirming the same person in the same frame is
        // corroboration, not a second sighting — otherwise standing in an
        // overlap would inflate the count at twice the rate of standing
        // anywhere else.
        if (!corroboration) {
          match.observations += 1;
          match.confidence = obs.confidence;
          match.image = image;
          match.cameraId = obs.cameraId;
          match.roomScope = obs.roomScope;
          if (floor) {
            match.floor = floor;
            match.floorFrame = calibration?.roomScope ?? null;
          }
          if (obs.estimatedHeightCm) {
            match.estimatedHeightCm = obs.estimatedHeightCm;
          }
        }
        // Once an individual is named, keep the name. resolveDetection refuses
        // to guess, so a frame that returns no name is an absence of evidence,
        // not evidence the track became anonymous.
        if (obs.targetName) match.targetName = obs.targetName;
        if (!match.cameraIds.includes(obs.cameraId)) match.cameraIds.push(obs.cameraId);

        // Check if this matched track is entering a doorway portal to another room
        this.checkDoorwayTransition(match, obs, now);
        continue;
      }

      // No spatial/image track matched. Check if an incoming doorway handover claims this observation
      let targetName = obs.targetName;
      if (!targetName) {
        targetName = this.claimPendingHandover(obs, now);
      }

      const expectedHeight = targetName ? RESIDENT_HEIGHTS_CM[targetName.toLowerCase()] : undefined;

      const track: Track = {
        id: this.makeId(),
        label: obs.label,
        targetName,
        floor,
        floorFrame: floor ? (calibration?.roomScope ?? null) : null,
        image,
        cameraId: obs.cameraId,
        roomScope: obs.roomScope,
        confidence: obs.confidence,
        firstSeenAt: now,
        lastSeenAt: now,
        observations: 1,
        cameraIds: [obs.cameraId],
        estimatedHeightCm: obs.estimatedHeightCm ?? expectedHeight,
      };
      this.tracks.set(track.id, track);
      claimed.set(track.id, new Set([obs.cameraId]));

      // Check if newly created track is already in/entering a doorway portal
      this.checkDoorwayTransition(track, obs, now);
    }

    return this.active();
  }

  private findMatch(
    obs: Observation,
    floor: Point2 | null,
    calibration: CameraCalibration | undefined,
    image: Point2,
    claimed: ReadonlyMap<string, Set<string>>,
    now: number,
  ): Track | null {
    let best: Track | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const track of this.tracks.values()) {
      // Only blocked if THIS camera already claimed the track this frame.
      if (claimed.get(track.id)?.has(obs.cameraId)) continue;
      // A person is never also a dog. Same rule the decoder's NMS applies.
      if (track.label !== obs.label) continue;

      if (floor && track.floor && track.floorFrame) {
        // Floor matching: the only path that can cross cameras. Guarded by
        // sharesFloorFrame so two rooms' unrelated coordinate systems are never
        // compared — that would teleport people between rooms.
        if (!calibration || !sharesFloorFrame(calibration, { roomScope: track.floorFrame } as CameraCalibration)) {
          continue;
        }
        // Radius scales with how long this track has gone unseen.
        const radius = Math.min(
          MAX_FLOOR_MATCH_RADIUS_M,
          Math.max(MIN_FLOOR_MATCH_RADIUS_M, this.maxSpeed * (Math.max(0, now - track.lastSeenAt) / 1000)),
        );
        const d = distance(floor, track.floor);
        if (d < radius && d < bestDistance) {
          bestDistance = d;
          best = track;
        }
        continue;
      }

      // Fallback: image space, same camera only. This is the pre-calibration
      // behaviour and cannot cross cameras, because two cameras' image
      // coordinates mean nothing to each other.
      if (track.cameraId !== obs.cameraId) continue;
      const d = distance(image, track.image);
      if (d < this.imageRadius && d < bestDistance) {
        bestDistance = d;
        best = track;
      }
    }

    return best;
  }

  private expire(now: number): void {
    for (const [id, track] of this.tracks) {
      if (now - track.lastSeenAt > this.ttlMs) this.tracks.delete(id);
    }
    this.pendingHandovers = this.pendingHandovers.filter((h) => now <= h.expiresAt);
  }

  active(): Track[] {
    return [...this.tracks.values()].sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  }

  get size(): number {
    return this.tracks.size;
  }

  /** Tracks seen by more than one camera — proof cross-camera identity works. */
  multiCameraTracks(): Track[] {
    return this.active().filter((t) => t.cameraIds.length > 1);
  }

  /** Current pending spatial doorway handovers waiting for target room observation. */
  activeHandovers(): readonly DoorwayHandover[] {
    return this.pendingHandovers;
  }

  private registerHandover(handover: DoorwayHandover): void {
    const existingIndex = this.pendingHandovers.findIndex(
      (h) => h.targetName === handover.targetName && h.targetRoomSlug === handover.targetRoomSlug,
    );
    if (existingIndex >= 0) {
      this.pendingHandovers[existingIndex] = handover;
    } else {
      this.pendingHandovers.push(handover);
    }
  }

  private checkDoorwayTransition(track: Track, obs: Observation, now: number): void {
    if (!track.targetName || this.portals.length === 0) return;

    for (const portal of this.portals) {
      if (portal.enabled === false) continue;
      if (portal.sourceRoomSlug !== obs.roomScope) continue;
      if (portal.sourceCameraId && portal.sourceCameraId !== obs.cameraId) continue;

      if (isDetectionInPortal(obs, portal)) {
        const slug = track.targetName.toLowerCase();
        const expectedHeightCm = RESIDENT_HEIGHTS_CM[slug] ?? track.estimatedHeightCm ?? obs.estimatedHeightCm;
        this.registerHandover({
          targetName: track.targetName,
          label: track.label,
          sourceRoomSlug: obs.roomScope,
          targetRoomSlug: portal.targetRoomSlug,
          portalId: portal.id,
          sourceTrackId: track.id,
          timestamp: now,
          expiresAt: now + this.handoverWindowMs,
          expectedHeightCm,
        });
      }
    }
  }

  private claimPendingHandover(obs: Observation, now: number): string | undefined {
    if (this.pendingHandovers.length === 0) return undefined;

    for (let i = 0; i < this.pendingHandovers.length; i++) {
      const handover = this.pendingHandovers[i];
      if (now > handover.expiresAt) continue;
      if (handover.label !== obs.label) continue;
      if (handover.targetRoomSlug !== obs.roomScope) continue;

      // Wave 4: Anthropometric Height Invariant Check
      if (
        obs.estimatedHeightCm !== undefined &&
        handover.expectedHeightCm !== undefined &&
        !isHeightCompatible(obs.estimatedHeightCm, handover.expectedHeightCm)
      ) {
        // Discrepancy > tolerance (18 cm). E.g. Joe (188cm) vs Malia (162cm) -> reject
        continue;
      }

      // Claim handover and transfer identity
      this.pendingHandovers.splice(i, 1);
      return handover.targetName;
    }

    return undefined;
  }
}

