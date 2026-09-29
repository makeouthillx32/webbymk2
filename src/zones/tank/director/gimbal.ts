// src/zones/tank/director/gimbal.ts
// ─────────────────────────────────────────────────────────────────────────────
// The virtual gimbal: how the AI's crop MOVES, separate from where it aims.
//
// Why this exists. AI Tracking used to recompute the crop from the raw detection
// box every 80 ms and lerp toward it. Three things made that bounce on air
// (Molly lying still, 2026-09-19: the shot scaled up and down ~8 times in 10 s):
//   1. every detection box is a little different, so the target never settled;
//   2. a frame without the box snapped the target to wide, then back;
//   3. a fixed per-tick lerp has no slow start, and in-and-out chases overshoot.
//
// Aiming (FramingAim) now holds its target until the subject really moves:
// the box is smoothed, the crop only re-centres when the subject leaves the
// middle of the shot, zoom only changes past a hysteresis band, and a lost
// subject is held for a few seconds before the shot eases back to wide.
// Moving (Gimbal) is a critically damped spring -- velocity starts at zero and
// bleeds off as it arrives: slow start, slow stop, no overshoot. Its
// "smoothness" is the operator's 1-10 dial.
//
// Pure functions: no React, no timers. The same code drives the staff monitor,
// the public Director and the OBS scene, so all three move identically.
// ─────────────────────────────────────────────────────────────────────────────

import { calculateAiTrackingCrop, type TrackingSpeed } from "./aiTrackingFraming";
import type { VirtualPtzState } from "./ptzState";
import type { FramingMode, NormalizedBoundingBox } from "../server/directorVirtualAtlas";

const W = 3840;
const H = 2160;
const MAX_ZOOM = 3.5;

/** Where the crop points: zoom and the crop centre, as fractions of the frame. */
export type GimbalAim = { zoom: number; cx: number; cy: number };

export const WIDE_AIM: GimbalAim = { zoom: 1, cx: 0.5, cy: 0.5 };

export type GimbalState = GimbalAim & { vz: number; vx: number; vy: number };

export const GIMBAL_SMOOTHNESS_MIN = 1;
export const GIMBAL_SMOOTHNESS_MAX = 10;
export const DEFAULT_GIMBAL_SMOOTHNESS = 6;

/**
 * The operator's dial, as the spring's time to (nearly) arrive. 1 is a quick,
 * still-gentle move (~0.3 s); 10 is a slow broadcast glide (~3 s). Sport halves
 * it: fast subjects need the camera to keep up more than they need grace.
 */
export function smoothnessToSeconds(level: number, speed: TrackingSpeed = "standard"): number {
  const l = clamp(Math.round(Number.isFinite(level) ? level : DEFAULT_GIMBAL_SMOOTHNESS), GIMBAL_SMOOTHNESS_MIN, GIMBAL_SMOOTHNESS_MAX);
  const seconds = 0.3 + ((l - 1) / 9) * 2.7;
  return speed === "sport" ? seconds / 2 : seconds;
}

/**
 * Critically damped spring step (the standard "SmoothDamp"). Starts from the
 * current velocity, so a move that begins at rest accelerates gently and
 * decelerates into the target without overshooting it.
 */
export function smoothDamp(
  current: number,
  target: number,
  velocity: number,
  smoothTime: number,
  dt: number,
): [value: number, velocity: number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const temp = (velocity + omega * change) * dt;
  let nextVelocity = (velocity - omega * temp) * decay;
  let next = target + (change + temp) * decay;
  // Never overshoot: if we crossed the target this step, land on it.
  if ((target - current > 0) === (next > target)) {
    next = target;
    nextVelocity = 0;
  }
  return [next, nextVelocity];
}

export function initialGimbal(aim: GimbalAim = WIDE_AIM): GimbalState {
  return { ...aim, vz: 0, vx: 0, vy: 0 };
}

/**
 * Advance the gimbal `dt` seconds toward `aim`. `arrivalSeconds` is how long a
 * move takes to get (98%) there -- the spring's own time constant is a third of
 * that, which is why the dial is expressed in arrival time instead.
 */
export function stepGimbal(state: GimbalState, aim: GimbalAim, dt: number, arrivalSeconds: number): GimbalState {
  const step = clamp(dt, 0, 0.25); // a backgrounded tab must not teleport on return
  const smoothTime = arrivalSeconds / 2.9;
  const [zoom, vz] = smoothDamp(state.zoom, aim.zoom, state.vz, smoothTime, step);
  const [cx, vx] = smoothDamp(state.cx, aim.cx, state.vx, smoothTime, step);
  const [cy, vy] = smoothDamp(state.cy, aim.cy, state.vy, smoothTime, step);
  const next = { zoom, cx, cy, vz, vx, vy };
  // The last sliver of a spring is invisible; land so renderers can go idle.
  return isGimbalSettled(next, aim) ? initialGimbal(aim) : next;
}

export function isGimbalSettled(state: GimbalState, aim: GimbalAim): boolean {
  return (
    Math.abs(state.zoom - aim.zoom) < 0.003 &&
    Math.abs(state.cx - aim.cx) < 0.001 &&
    Math.abs(state.cy - aim.cy) < 0.001 &&
    Math.abs(state.vz) + Math.abs(state.vx) + Math.abs(state.vy) < 0.01
  );
}

/** The crop as the renderers and the server lease speak it: zoom and 4K pixel pan. */
export function aimToPtz(aim: GimbalAim, speed: TrackingSpeed = "standard"): VirtualPtzState {
  const zoom = clamp(aim.zoom, 1, MAX_ZOOM);
  const cropW = W / zoom;
  const cropH = H / zoom;
  return {
    zoomFactor: Number(zoom.toFixed(3)),
    // The whole frame is reachable: the crop may sit flush against any edge.
    panOffsetX: Number(clamp(aim.cx * W - cropW / 2, 0, W - cropW).toFixed(1)),
    panOffsetY: Number(clamp(aim.cy * H - cropH / 2, 0, H - cropH).toFixed(1)),
    zoomSpeed: speed === "sport" ? 9 : 5,
    speedMode: speed === "sport" ? "sport" : "fine",
  };
}

export function ptzToAim(ptz: Pick<VirtualPtzState, "zoomFactor" | "panOffsetX" | "panOffsetY"> | null | undefined): GimbalAim {
  if (!ptz) return WIDE_AIM;
  const zoom = clamp(Number.isFinite(ptz.zoomFactor) ? ptz.zoomFactor : 1, 1, MAX_ZOOM);
  if (zoom <= 1) return WIDE_AIM;
  return {
    zoom,
    cx: (ptz.panOffsetX + W / zoom / 2) / W,
    cy: (ptz.panOffsetY + H / zoom / 2) / H,
  };
}

// ── aiming ───────────────────────────────────────────────────────────────────

export type FramingAimState = {
  /** The subject box, smoothed across detections. */
  box: NormalizedBoundingBox | null;
  /** Where the gimbal is told to point. Changes rarely -- that is the point. */
  aim: GimbalAim;
  lastSeenAt: number;
};

export const FRAMING_AIM_TUNING = {
  /** Weight of each new detection in the smoothed box. */
  boxSmoothing: 0.3,
  /** Keep the shot on a subject this long after its box disappears. */
  lostHoldMs: 4_000,
  /** Re-centre only once the subject's centre leaves this middle part of the crop. */
  deadZone: 0.5,
  /** Change zoom only when the ideal zoom is this far (as a ratio) from the current aim. */
  zoomHysteresis: 0.18,
  /** A candidate further than this (frame fractions) from the followed box is a different body. */
  continuityRadius: 0.25,
} as const;

export function initialFramingAim(): FramingAimState {
  return { box: null, aim: WIDE_AIM, lastSeenAt: 0 };
}

const centre = (b: NormalizedBoundingBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

/**
 * Pick the body to frame: the one nearest the body already framed, so a second
 * dog walking past does not steal the shot; otherwise the largest.
 */
export function pickSubject(
  candidates: NormalizedBoundingBox[],
  followed: NormalizedBoundingBox | null,
): NormalizedBoundingBox | null {
  if (candidates.length === 0) return null;
  if (followed) {
    const f = centre(followed);
    let best: NormalizedBoundingBox | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const p = centre(c);
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    if (best && bestD <= FRAMING_AIM_TUNING.continuityRadius) return best;
  }
  return candidates.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
}

function blend(a: NormalizedBoundingBox, b: NormalizedBoundingBox, k: number): NormalizedBoundingBox {
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    width: a.width + (b.width - a.width) * k,
    height: a.height + (b.height - a.height) * k,
  };
}

/**
 * Fold one detection into the aim. Call it when telemetry arrives (not every
 * animation frame): the aim is a decision, the gimbal is the motion.
 */
export function stepFramingAim(
  state: FramingAimState,
  candidates: NormalizedBoundingBox[],
  mode: FramingMode,
  now: number,
): FramingAimState {
  const T = FRAMING_AIM_TUNING;
  if (mode === "camera" || mode === "wide") return { box: null, aim: WIDE_AIM, lastSeenAt: now };

  const seen = pickSubject(candidates, state.box);
  if (!seen) {
    // Lost for a moment is not gone: a lying dog drops out of detection now and
    // then. Only a sustained absence lets the shot drift back to wide.
    if (state.box && now - state.lastSeenAt < T.lostHoldMs) return state;
    return { box: null, aim: WIDE_AIM, lastSeenAt: state.lastSeenAt };
  }

  const box = state.box ? blend(state.box, seen, T.boxSmoothing) : seen;
  const ideal = ptzToAim(calculateAiTrackingCrop(box, mode));

  // First sight, or coming back from wide: aim straight at it.
  if (!state.box || state.aim.zoom <= 1.001) {
    return { box, aim: ideal, lastSeenAt: now };
  }

  const aim = { ...state.aim };
  const zoomOff = Math.abs(ideal.zoom / aim.zoom - 1) > T.zoomHysteresis;
  if (zoomOff) aim.zoom = ideal.zoom;

  // Where the subject sits inside the current crop, -1..1 on each axis.
  const halfW = 0.5 / aim.zoom;
  const halfH = 0.5 / aim.zoom;
  const subject = centre(box);
  const offX = (subject.x - aim.cx) / halfW;
  const offY = (subject.y - aim.cy) / halfH;
  if (zoomOff || Math.abs(offX) > T.deadZone || Math.abs(offY) > T.deadZone) {
    aim.cx = ideal.cx;
    aim.cy = ideal.cy;
  }
  return { box, aim, lastSeenAt: now };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
