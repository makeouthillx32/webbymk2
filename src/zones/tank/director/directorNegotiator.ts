// src/zones/tank/director/directorNegotiator.ts
// ─────────────────────────────────────────────────────────────────────────────
// TouchDesigner-Inspired Director Room & Angle Negotiator
//
// Coordinates automated camera selection and scene cutting between active rooms
// based on dynamic audio energy, decibel peaks, dwell-time hysteresis,
// and moderator Director Attention overrides.
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscoveredCamera } from "../contracts";
import {
  type CameraAudioMetrics,
  type DirectorAttentionLock,
  resolveMultiCameraAngle,
  calculateCameraScore,
  MIN_DWELL_TIME_SECONDS,
  SWITCH_ENERGY_DELTA_THRESHOLD,
} from "./directorMetrics";

export type DirectorNegotiationState =
  | "standby"
  | "attention_locked"
  | "audio_tracking"
  | "no_rooms"
  | "locked"
  | "scripted";

export type DirectorModeType = "STANDBY" | "AUDIO_TRACKING" | "ATTENTION_LOCKED" | "MANUAL_LOCK" | "NO_ROOMS";

export type DirectorNegotiationResult = {
  state: DirectorNegotiationState;
  directorMode: DirectorModeType;
  selectedCameraId?: string;
  selectedRoomKey?: string;
  candidateRoomsCount: number;
  statusMessage: string;
  rationale: string;
  isAttentionActive: boolean;
  attentionLabel?: string;
  attentionTimeRemaining?: number | null;
  activeDecibels?: number;
};

/**
 * Negotiates which room camera to cut to given the current camera directory,
 * active Director Attention lock, and real-time audio metrics.
 */
export function negotiateDirectorFeed(
  cameras: DiscoveredCamera[],
  onlineCameraIds: string[],
  directorAssignedCameraId?: string,
  attentionLock?: DirectorAttentionLock,
  audioMetricsMap?: Map<string, CameraAudioMetrics>,
  currentCameraId?: string,
  dwellSeconds: number = 0
): DirectorNegotiationResult {
  // Filter for valid online cameras
  const activeCameras = cameras.filter(
    (c) =>
      onlineCameraIds.includes(c.id) &&
      (c.presence === "online" || c.presence === "degraded")
  );

  // 1. Zero rooms available
  if (activeCameras.length === 0) {
    return {
      state: "no_rooms",
      directorMode: "NO_ROOMS",
      candidateRoomsCount: 0,
      statusMessage: "I have no rooms to play with. I have no rooms to negotiate between.",
      rationale: "Zero online camera feeds available in the house topology.",
      isAttentionActive: false,
    };
  }

  // 2. Moderator Director Attention Lock is Active
  if (attentionLock?.active) {
    // 2A: Attention locked to a specific camera (or IRL backpack)
    if (attentionLock.targetType === "camera" || attentionLock.targetType === "irl") {
      const targetCam = activeCameras.find(
        (c) => c.id === attentionLock.targetId || c.slug === attentionLock.targetId
      );
      if (targetCam) {
        const metric = audioMetricsMap?.get(targetCam.id);
        const db = metric ? Math.round(metric.decibels) : undefined;
        return {
          state: "attention_locked",
          directorMode: "ATTENTION_LOCKED",
          selectedCameraId: targetCam.id,
          selectedRoomKey: targetCam.roomScope,
          candidateRoomsCount: 1,
          statusMessage: `🎯 Director Attention: ${attentionLock.targetLabel}`,
          rationale: `Locked by ${attentionLock.lockedBy}. Direct angle feed active (${db ?? -30} dB).`,
          isAttentionActive: true,
          attentionLabel: attentionLock.targetLabel,
          activeDecibels: db,
        };
      }
    }

    // 2B: Attention locked to a specific Room (e.g. "living-room" for Karaoke)
    if (attentionLock.targetType === "room") {
      const roomCameras = activeCameras.filter(
        (c) => c.roomScope === attentionLock.targetId
      );

      if (roomCameras.length > 0) {
        // Resolve best angle within the attention-locked room via audio peak
        const angleResult = resolveMultiCameraAngle(
          roomCameras,
          audioMetricsMap ?? new Map(),
          currentCameraId,
          dwellSeconds
        );

        const metric = audioMetricsMap?.get(angleResult.selectedCameraId);
        const db = metric ? Math.round(metric.decibels) : undefined;

        return {
          state: "attention_locked",
          directorMode: "ATTENTION_LOCKED",
          selectedCameraId: angleResult.selectedCameraId,
          selectedRoomKey: attentionLock.targetId,
          candidateRoomsCount: roomCameras.length,
          statusMessage: `🎯 Director Attention: ${attentionLock.targetLabel} (${roomCameras.length} Cams)`,
          rationale: `Locked by ${attentionLock.lockedBy}. ${angleResult.rationale}`,
          isAttentionActive: true,
          attentionLabel: attentionLock.targetLabel,
          activeDecibels: db,
        };
      }
    }
  }

  // 3. Explicit NOALBS or Admin Hard Lock
  if (directorAssignedCameraId && onlineCameraIds.includes(directorAssignedCameraId)) {
    const assignedCam = activeCameras.find((c) => c.id === directorAssignedCameraId);
    return {
      state: "locked",
      directorMode: "MANUAL_LOCK",
      selectedCameraId: directorAssignedCameraId,
      selectedRoomKey: assignedCam?.roomScope,
      candidateRoomsCount: activeCameras.length,
      statusMessage: `Locked to ${assignedCam?.name ?? "Assigned Feed"}`,
      rationale: "NOALBS or hardware switcher override active.",
      isAttentionActive: false,
    };
  }

  // 4. Auto Audio-Tracking Director (TouchDesigner-inspired highest energy selection with Discernment Dwell)
  if (audioMetricsMap && audioMetricsMap.size > 0) {
    const currentCam = activeCameras.find((c) => c.id === currentCameraId);
    let currentScore = 0;
    let currentMetric: CameraAudioMetrics | undefined;

    if (currentCam) {
      currentMetric = audioMetricsMap.get(currentCam.id) ?? {
        cameraId: currentCam.id,
        roomScope: currentCam.roomScope ?? "",
        name: currentCam.name,
        decibels: -45,
        audioEnergy: 0.1,
        isSpeaking: false,
        peakHoldDb: -45,
        activityScore: 0.1,
      };
      currentScore = calculateCameraScore(currentMetric, true, dwellSeconds);
    }

    let topChallenger = currentCam ?? activeCameras[0];
    let topChallengerScore = -1;

    for (const cam of activeCameras) {
      if (cam.id === currentCameraId) continue;

      const metric = audioMetricsMap.get(cam.id) ?? {
        cameraId: cam.id,
        roomScope: cam.roomScope ?? "",
        name: cam.name,
        decibels: -45,
        audioEnergy: 0.1,
        isSpeaking: false,
        peakHoldDb: -45,
        activityScore: 0.1,
      };

      const score = calculateCameraScore(metric, false, 0);

      if (score > topChallengerScore) {
        topChallengerScore = score;
        topChallenger = cam;
      }
    }

    // Discernment Decision:
    // Only cut away from current camera if:
    // 1. Dwell time has exceeded MIN_DWELL_TIME_SECONDS (75s) AND challenger score exceeds current by SWITCH_ENERGY_DELTA_THRESHOLD (0.45)
    // 2. OR Challenger room has an emergency loud spike (> -12 dB) while current room is in dead silence (< -40 dB)
    const challengerMetric = audioMetricsMap.get(topChallenger.id);
    const hasEmergencySpike =
      (challengerMetric?.decibels ?? -50) > -12 && (currentMetric?.decibels ?? -50) < -38;
    const canSwitchByDwell =
      dwellSeconds >= MIN_DWELL_TIME_SECONDS &&
      topChallengerScore - currentScore > SWITCH_ENERGY_DELTA_THRESHOLD &&
      Boolean(challengerMetric?.isSpeaking);

    let chosenCam = currentCam ?? activeCameras[0];

    if (currentCam && (hasEmergencySpike || canSwitchByDwell)) {
      chosenCam = topChallenger;
    } else if (!currentCam) {
      chosenCam = topChallenger;
    }

    const metric = audioMetricsMap.get(chosenCam.id);
    const db = metric ? Math.round(metric.decibels) : -30;

    return {
      state: "audio_tracking",
      directorMode: "AUDIO_TRACKING",
      selectedCameraId: chosenCam.id,
      selectedRoomKey: chosenCam.roomScope,
      candidateRoomsCount: activeCameras.length,
      statusMessage: `🎙️ Auto Director: ${chosenCam.name} (${db} dB)`,
      rationale: `Discernment tracking active. Dwell: ${dwellSeconds}s (Min ${MIN_DWELL_TIME_SECONDS}s).`,
      isAttentionActive: false,
      activeDecibels: db,
    };
  }

  // 5. Standby Mode (Auto-Cycle Round-Robin between Active Rooms)
  const cycleIndex = Math.floor(dwellSeconds / 15) % activeCameras.length;
  const standbyCam = activeCameras[cycleIndex] || activeCameras[0];

  return {
    state: "standby",
    directorMode: "STANDBY",
    selectedCameraId: standbyCam.id,
    selectedRoomKey: standbyCam.roomScope,
    candidateRoomsCount: activeCameras.length,
    statusMessage: `Standby auto-cycle: ${standbyCam.name}`,
    rationale: `Director in Standby mode. Cycling room feeds every 15s.`,
    isAttentionActive: false,
  };
}
