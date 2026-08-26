// src/zones/tank/director/directorMetrics.ts
// ─────────────────────────────────────────────────────────────────────────────
// TouchDesigner-Inspired Audio Energy & Decibel Metrics Engine
//
// Models continuous audio RMS, peak-hold decibels (-60 dB to 0 dB),
// speech burst detection, and dwell-time hysteresis for intelligent broadcast
// cutting between rooms and multi-camera angles.
// ─────────────────────────────────────────────────────────────────────────────

export type CameraAudioMetrics = {
  cameraId: string;
  roomScope: string;
  name: string;
  decibels: number;       // e.g. -60 (silence) to 0 (peak clipping)
  audioEnergy: number;    // 0.0 to 1.0 normalized energy
  isSpeaking: boolean;    // true if decibels > speech threshold (-28 dB)
  peakHoldDb: number;     // highest peak in the current window
  activityScore: number;  // composite weighted score
  lastDwellSeconds?: number;
};

export type DirectorAttentionLock = {
  active: boolean;
  targetType: "room" | "camera" | "irl";
  targetId: string;        // e.g. "living-room", "kitchen", "cam-1786768240092"
  targetLabel: string;     // e.g. "Living Room", "IRL Backpack 1"
  expiresAt: number | null; // epoch ms or null for indefinite
  durationMinutes: number | "indefinite";
  lockedBy: string;        // Operator handle
  multiCameraMode: "audio_peak" | "round_robin" | "fixed_primary";
  startedAt: number;
};

export const DEFAULT_DIRECTOR_ATTENTION: DirectorAttentionLock = {
  active: false,
  targetType: "room",
  targetId: "director",
  targetLabel: "Auto Director (House-Wide)",
  expiresAt: null,
  durationMinutes: "indefinite",
  lockedBy: "System",
  multiCameraMode: "audio_peak",
  startedAt: 0,
};

export const SPEECH_THRESHOLD_DB = -24;
export const NOISE_SPIKE_THRESHOLD_DB = -10;
export const MIN_DWELL_TIME_SECONDS = 90;  // 1.5 minutes minimum discernment hold
export const MAX_DWELL_TIME_SECONDS = 360; // 6.0 minutes maximum hold
export const SWITCH_ENERGY_DELTA_THRESHOLD = 0.5; // Requires significant, sustained energy gap to switch

/**
 * Normalizes decibels (-60dB to 0dB) to a 0.0 – 1.0 linear energy curve
 * with perceptual exponential scaling.
 */
export function dbToEnergy(db: number): number {
  const clamped = Math.max(-60, Math.min(0, db));
  // Convert -60..0 to 0..1 range
  const normalized = (clamped + 60) / 60;
  // Apply TouchDesigner-style power curve for perceived loudness
  return Math.pow(normalized, 1.8);
}

/**
 * Calculates a composite director interest score for a camera feed.
 * Higher score = higher priority for the automated Director.
 */
export function calculateCameraScore(
  metrics: CameraAudioMetrics,
  isCurrentlyOnScreen: boolean,
  dwellSeconds: number
): number {
  let score = metrics.audioEnergy * 0.5;

  if (metrics.isSpeaking) {
    score += 0.25;
  }

  // TouchDesigner-style peak boost
  if (metrics.peakHoldDb > NOISE_SPIKE_THRESHOLD_DB) {
    score += 0.2;
  }

  // Dwell-time dynamics:
  if (isCurrentlyOnScreen) {
    // Strongly protect current room if under minimum dwell time (75s)
    if (dwellSeconds < MIN_DWELL_TIME_SECONDS) {
      score += 1.5;
    } else if (dwellSeconds < MAX_DWELL_TIME_SECONDS) {
      // Solid stability shield while within normal dwell window
      score += 0.35;
    } else {
      // Gentle decay only after prolonged dwell (> 5 minutes)
      const overtime = dwellSeconds - MAX_DWELL_TIME_SECONDS;
      score -= Math.min(0.4, overtime * 0.005);
    }
  }

  return Math.max(0, Math.min(3.0, score));
}

/**
 * Evaluates candidate cameras within an Attention-Locked Room (e.g. Living Room)
 * to select the best camera angle based on active audio.
 */
export function resolveMultiCameraAngle(
  roomCameras: { id: string; name: string }[],
  metricsMap: Map<string, CameraAudioMetrics>,
  currentCameraId?: string,
  dwellSeconds: number = 0
): { selectedCameraId: string; rationale: string } {
  if (roomCameras.length === 0) {
    return { selectedCameraId: "", rationale: "No cameras in room." };
  }
  if (roomCameras.length === 1) {
    return {
      selectedCameraId: roomCameras[0].id,
      rationale: `Single camera in room (${roomCameras[0].name}).`,
    };
  }

  let bestCam = roomCameras[0];
  let bestScore = -1;

  for (const cam of roomCameras) {
    const metric = metricsMap.get(cam.id) ?? {
      cameraId: cam.id,
      roomScope: "",
      name: cam.name,
      decibels: -45,
      audioEnergy: dbToEnergy(-45),
      isSpeaking: false,
      peakHoldDb: -45,
      activityScore: 0.1,
    };

    const isCurrent = cam.id === currentCameraId;
    const score = calculateCameraScore(metric, isCurrent, isCurrent ? dwellSeconds : 0);

    if (score > bestScore) {
      bestScore = score;
      bestCam = cam;
    }
  }

  const bestMetric = metricsMap.get(bestCam.id);
  const dbText = bestMetric ? `${Math.round(bestMetric.decibels)} dB` : "active";

  return {
    selectedCameraId: bestCam.id,
    rationale: `Angle selected: ${bestCam.name} (${dbText} audio peak)`,
  };
}
