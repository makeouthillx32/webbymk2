import type { CameraTelemetryInput, SubjectMode } from "./directorVirtualAtlas";

// Live detection telemetry, in memory.
//
// This is the missing link between the detection layer and the director. The
// telemetry model, the subject-mode scoring and the canvas overlay were all
// built already, but nothing ever fed them: the configuration screen
// fabricated numbers (`peopleCount: idx === 0 ? 3 : ...`) and the live
// director ignored the scorer entirely and cut round-robin. This is where real
// numbers land.
//
// Deliberately NOT persisted. Telemetry arrives many times a second, is only
// meaningful for a moment, and is worthless after a restart — writing it to
// Postgres would cost far more than it returns. It shares that reasoning with
// the viewer presence snapshot.

/**
 * How long a reading stays usable. A detector posting at 2-10 Hz refreshes
 * well inside this; anything older than this means the producer has stopped
 * and the director must fall back rather than cut on a stale frame.
 */
export const TELEMETRY_TTL_MS = 4000;

type StoredTelemetry = {
  telemetry: CameraTelemetryInput;
  receivedAt: number;
};

const g_telemetry = new Map<string, StoredTelemetry>();

/** Subject mode requested by the detector, if it wants to drive the mode too. */
let g_suggestedMode: SubjectMode | null = null;

/**
 * Mode chosen by an operator. Outranks the detector's suggestion.
 *
 * In memory rather than persisted: this is a live production control, like a
 * vision mixer's mode switch, and defaulting back to `auto` after a deploy is
 * safer than silently resuming a mode nobody remembers selecting.
 */
let g_operatorMode: SubjectMode | null = null;

/**
 * Rolling audio baseline per camera, as an exponential moving average.
 *
 * Absolute loudness is the wrong signal for "where is something happening".
 * One room being permanently noisy — a game room with audio always blasting —
 * wins every comparison forever, so `speaker` mode pins there and never cuts
 * away. What actually matters is a room being loud *for that room*.
 *
 * The baseline is what this measures against, so a normally-quiet kitchen
 * suddenly at 60 outranks a game room sitting at its usual 85.
 */
const g_audioBaseline = new Map<string, number>();

/** How fast the baseline follows the room. Slow enough to survive a shout. */
const BASELINE_ALPHA = 0.02;

function updateAudioBaseline(cameraId: string, audioPeak: number): void {
  const prev = g_audioBaseline.get(cameraId);
  g_audioBaseline.set(
    cameraId,
    prev === undefined ? audioPeak : prev + BASELINE_ALPHA * (audioPeak - prev),
  );
}

/**
 * How far above its own normal a room currently is, 0-100.
 *
 * Returns the raw level until a baseline has had time to settle, so the
 * director behaves sensibly in the first seconds after a restart rather than
 * treating every room as unremarkable.
 */
export function audioExcess(cameraId: string, audioPeak: number): number {
  const baseline = g_audioBaseline.get(cameraId);
  if (baseline === undefined) return audioPeak;
  return Math.max(0, Math.min(100, (audioPeak - baseline) * 1.5));
}

/**
 * Real-but-approximate activity signal, fed automatically from each
 * camera's own encoded bitrate — no detector required.
 *
 * The actual person/audio/feet detection pipeline ("Python boxes" /
 * TouchDesigner) was never built, and without it hasUsableTelemetry() is
 * never true, which means the operator's subject-mode selection in the
 * house console is silently ignored forever — confirmed live 2026-08-24,
 * every mode card except the direct Attention Lock override fell through
 * to blind round-robin regardless of what was clicked.
 *
 * This is not a substitute for real detection — peopleCount, faceCount,
 * feetConfidence and audioPeak all stay honestly at 0 here, so
 * face/feet/speaker-specific scoring gets nothing extra from this path.
 * What it does give, non-fabricated: most encoders spend more bits when a
 * scene has more going on (movement, changing content) than when it's
 * static, so a room's bitrate rising above ITS OWN normal — exactly the
 * same "excess over rolling baseline" trick audioExcess already uses, not
 * an absolute threshold, since a 4K room and a 720p room have nothing in
 * common on raw bitrate — is a real signal for "more is happening here
 * than usual", which is enough to drive motion/crowd/chaos/auto scoring
 * without waiting on the full detection pipeline.
 */
const g_bitrateBaseline = new Map<string, number>();
const BITRATE_BASELINE_ALPHA = 0.05;

export function bitrateDerivedMotionScore(cameraId: string, bitrateKbps: number): number {
  if (!(bitrateKbps > 0)) return 0;
  const prev = g_bitrateBaseline.get(cameraId);
  g_bitrateBaseline.set(
    cameraId,
    prev === undefined ? bitrateKbps : prev + BITRATE_BASELINE_ALPHA * (bitrateKbps - prev),
  );
  if (prev === undefined) return 0;
  // Anything at or below baseline scores 0; roughly double the baseline
  // saturates at 1. Deliberately gentle (the divisor, not the multiplier)
  // so a single noisy sample doesn't swing the score wildly — the EMA
  // baseline already does most of the smoothing.
  const excessRatio = (bitrateKbps - prev) / Math.max(prev, 1);
  return Math.max(0, Math.min(1, excessRatio));
}

export function setOperatorMode(mode: SubjectMode | null): void {
  g_operatorMode = mode;
}

export function getOperatorMode(): SubjectMode | null {
  return g_operatorMode;
}

/**
 * The mode the director should actually run.
 *
 * Operator selection wins, then the detector's suggestion, then auto. An
 * operator who picks "group" must get group even if the detector is convinced
 * someone is talking.
 */
export function getEffectiveMode(): SubjectMode {
  return g_operatorMode ?? g_suggestedMode ?? "auto";
}

export function recordTelemetry(inputs: CameraTelemetryInput[], mode?: SubjectMode | null): number {
  const now = Date.now();
  let stored = 0;
  for (const t of inputs) {
    if (!t || typeof t.cameraId !== "string" || !t.cameraId) continue;
    g_telemetry.set(t.cameraId, { telemetry: t, receivedAt: now });
    updateAudioBaseline(t.cameraId, t.audioPeak);
    stored += 1;
  }
  if (mode) g_suggestedMode = mode;
  return stored;
}

/** Fresh readings only. Expired entries are dropped as they are found. */
export function getFreshTelemetry(now = Date.now()): CameraTelemetryInput[] {
  const out: CameraTelemetryInput[] = [];
  for (const [cameraId, entry] of g_telemetry) {
    if (now - entry.receivedAt > TELEMETRY_TTL_MS) {
      g_telemetry.delete(cameraId);
      continue;
    }
    out.push(entry.telemetry);
  }
  return out;
}

export function getTelemetryFor(cameraId: string, now = Date.now()): CameraTelemetryInput | null {
  const entry = g_telemetry.get(cameraId);
  if (!entry) return null;
  if (now - entry.receivedAt > TELEMETRY_TTL_MS) {
    g_telemetry.delete(cameraId);
    return null;
  }
  return entry.telemetry;
}

export function getSuggestedMode(): SubjectMode | null {
  return g_suggestedMode;
}

/**
 * Whether the director should trust telemetry at all right now.
 *
 * One camera reporting is not enough to run a comparison — scoring picks a
 * winner among rooms, so a single reading would always "win" and pin the cut
 * to whichever camera happens to have a detector attached.
 */
export function hasUsableTelemetry(now = Date.now()): boolean {
  return getFreshTelemetry(now).length >= 2;
}

/** Diagnostics for the admin surface: who is reporting, and how stale. */
export function describeTelemetry(now = Date.now()): {
  cameras: { cameraId: string; ageMs: number }[];
  usable: boolean;
  suggestedMode: SubjectMode | null;
} {
  const cameras: { cameraId: string; ageMs: number }[] = [];
  for (const [cameraId, entry] of g_telemetry) {
    cameras.push({ cameraId, ageMs: now - entry.receivedAt });
  }
  cameras.sort((a, b) => a.ageMs - b.ageMs);
  return { cameras, usable: hasUsableTelemetry(now), suggestedMode: g_suggestedMode };
}

/**
 * Coerces one detector reading into the telemetry contract.
 *
 * Everything is clamped and defaulted rather than trusted. A detector sending
 * NaN, a negative count, or a 0-1 audio level where 0-100 was expected would
 * otherwise poison the scoring and swing the live cut. Shared between the
 * shared-secret external-detector route and the staff-authenticated
 * browser-detector route — both feed the same store and must trust their
 * input equally little.
 */
export function normaliseTelemetryReading(raw: any): CameraTelemetryInput | null {
  if (!raw || typeof raw.cameraId !== "string" || !raw.cameraId) return null;

  const num = (v: unknown, min: number, max: number, fallback = 0): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  return {
    cameraId: raw.cameraId.slice(0, 128),
    peopleCount: Math.round(num(raw.peopleCount, 0, 64)),
    visibleFeetCount: Math.round(num(raw.visibleFeetCount, 0, 128)),
    feetConfidence: num(raw.feetConfidence, 0, 1),
    faceCount: Math.round(num(raw.faceCount, 0, 64)),
    motionScore: num(raw.motionScore, 0, 1),
    audioPeak: num(raw.audioPeak, 0, 100),
    isSpeaking: Boolean(raw.isSpeaking),
    itemTriggerCount: Math.round(num(raw.itemTriggerCount, 0, 999)),
    targetMemberDetected:
      typeof raw.targetMemberDetected === "string" ? raw.targetMemberDetected.slice(0, 64) : null,
    targetMemberConfidence: num(raw.targetMemberConfidence, 0, 1),
    depthZone: raw.depthZone,
    quantizedDepthBin: Math.round(num(raw.quantizedDepthBin, 0, 7)),
    depthScalingFactor: num(raw.depthScalingFactor, 0, 1, 1),
    lighting: raw.lighting,
    boundingBoxes: Array.isArray(raw.boundingBoxes)
      ? raw.boundingBoxes.slice(0, 64).map((b: any) => ({
          nx: num(b?.nx, 0, 1),
          ny: num(b?.ny, 0, 1),
          nw: num(b?.nw, 0, 1),
          nh: num(b?.nh, 0, 1),
          label: typeof b?.label === "string" ? b.label.slice(0, 48) : "object",
          depthZone: b?.depthZone,
        }))
      : undefined,
  };
}

/** Test seam. */
export function __resetTelemetry(): void {
  g_telemetry.clear();
  g_suggestedMode = null;
  g_operatorMode = null;
  g_audioBaseline.clear();
}
