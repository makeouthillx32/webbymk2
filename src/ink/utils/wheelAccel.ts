// src/ink/utils/wheelAccel.ts
// ─────────────────────────────────────────────────────────────────────────────
// Adaptive wheel/trackpad scroll acceleration — pure functions, fully testable.
//
// Two timing modes (detected by inter-event gap):
//
//   Trackpad  (gap < 40ms)  — linear ramp: fast flicks cap at 6 lines,
//                             slow swipes produce 1. Feels like native.
//
//   Mouse     (gap ≥ 40ms)  — exponential decay: velocity starts at base and
//                             decays each tick. Bounce detection suppresses
//                             encoder bounce (two events < 8ms apart).
//
//   xterm.js  (VS Code)     — tighter decay curve tuned for 20-50ms event
//                             rate (VS Code's terminal batches differently).
//
// Env override:
//   UNAXIS_SCROLL_SPEED=2   — base speed multiplier (default 1.0)
//   CLAUDE_CODE_SCROLL_SPEED accepted as alias.
//
// Usage:
//   const accel = useRef(initWheelAccel());
//   // on wheelUp / wheelDown event:
//   const { step, next } = computeWheelStep(accel.current, 'up', termProgram);
//   accel.current = next;
//   scrollBy(-step);
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WheelAccelState {
  /** ms timestamp of the last wheel event (0 = never). */
  lastEventMs:  number;
  /** Current velocity (lines/event), decays between events. */
  velocity:     number;
  /** Last scroll direction — used for bounce suppression. */
  lastDir:      'up' | 'down' | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TRACKPAD_GAP_MS   = 40;    // below this → trackpad mode
const TRACKPAD_CAP      = 6;     // max lines per trackpad event
const BOUNCE_GAP_MS     = 8;     // below this with dir reversal → bounce, skip
const MOUSE_BASE        = 3;     // starting velocity for mouse wheel
const MOUSE_DECAY       = 0.82;  // velocity multiplier per 100ms of silence
const XTERM_BASE        = 2;
const XTERM_DECAY       = 0.88;
const XTERM_GAP_THRESH  = 25;    // xterm events cluster < 25ms

// ── Helpers ───────────────────────────────────────────────────────────────────

export function readScrollSpeedBase(): number {
  const raw =
    process.env['UNAXIS_SCROLL_SPEED'] ??
    process.env['CLAUDE_CODE_SCROLL_SPEED'];
  const v = parseFloat(raw ?? '1');
  return isFinite(v) && v > 0 ? v : 1;
}

export function initWheelAccel(): WheelAccelState {
  return { lastEventMs: 0, velocity: 0, lastDir: null };
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Compute how many lines to scroll for one wheel event.
 *
 * @param state      Current acceleration state (treat as immutable).
 * @param direction  'up' or 'down'.
 * @param termProgram  process.env.TERM_PROGRAM — used to detect xterm.js.
 * @returns          { step: lines to scroll (always ≥ 1), next: new state }
 */
export function computeWheelStep(
  state:       WheelAccelState,
  direction:   'up' | 'down',
  termProgram?: string,
): { step: number; next: WheelAccelState } {
  const now  = Date.now();
  const gap  = state.lastEventMs > 0 ? now - state.lastEventMs : Infinity;
  const base = readScrollSpeedBase();

  const next: WheelAccelState = {
    lastEventMs: now,
    velocity:    state.velocity,
    lastDir:     direction,
  };

  // ── Bounce suppression ─────────────────────────────────────────────────────
  // Mechanical encoder bounce: two events in opposite directions < 8ms apart.
  // Skip the second one entirely (return 0 lines → caller should skip scroll).
  if (gap < BOUNCE_GAP_MS && state.lastDir !== null && state.lastDir !== direction) {
    return { step: 0, next: { ...next, velocity: state.velocity } };
  }

  // ── Trackpad mode ──────────────────────────────────────────────────────────
  if (gap < TRACKPAD_GAP_MS) {
    // Linear ramp: more events per second → higher per-event step, capped.
    const rate = Math.min(1, TRACKPAD_GAP_MS / Math.max(1, gap));
    const step = Math.max(1, Math.min(TRACKPAD_CAP, Math.round(rate * TRACKPAD_CAP * base)));
    return { step, next: { ...next, velocity: step } };
  }

  // ── xterm.js (VS Code) mode ────────────────────────────────────────────────
  const isXterm = termProgram === 'vscode' || termProgram === 'iTerm.app';
  if (isXterm && gap < XTERM_GAP_THRESH * 4) {
    const decay   = Math.pow(XTERM_DECAY, gap / 100);
    const newVel  = Math.max(XTERM_BASE, state.velocity * decay);
    const step    = Math.max(1, Math.round(newVel * base));
    return { step, next: { ...next, velocity: newVel } };
  }

  // ── Mouse wheel mode ───────────────────────────────────────────────────────
  // Velocity decays exponentially with silence, ramps back up on rapid clicks.
  const decay  = gap < Infinity ? Math.pow(MOUSE_DECAY, gap / 100) : 0;
  const newVel = Math.max(MOUSE_BASE, state.velocity * decay + MOUSE_BASE * 0.3);
  const step   = Math.max(1, Math.round(newVel * base));
  return { step, next: { ...next, velocity: newVel } };
}
