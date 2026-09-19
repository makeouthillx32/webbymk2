// src/zones/tank/director/aiTrackingFraming.ts
// ─────────────────────────────────────────────────────────────────────────────
// Autonomous AI Tracking & Advanced Framing Matrix
//
// Calculates virtual PTZ framing for:
// - Normal Tracking (Full body)
// - Upper Body (Waist-up / bust framing)
// - Close-up (Face / head framing)
// - Headless (Waist-down / shoes / floor)
// - Lower Body (Legs / floor)
// - Zone Tracking (Bounded within room sub-zone)
// - Group Cluster (Multi-subject compound centroid)
// ─────────────────────────────────────────────────────────────────────────────

import type { VirtualPtzState } from "./ptzState";
import {
  calculateCameraScore,
  type FramingMode,
  type NormalizedBoundingBox,
  type SubjectMode,
  type CameraTelemetryInput,
  type CameraTileBounds,
} from "../server/directorVirtualAtlas";

export type TrackingSpeed = "standard" | "sport";

export type AiSubjectTarget =
  | "auto"
  | "group"
  | "member"
  | "dog"
  | "cat"
  | "feet";

export type AiTrackingConfig = {
  canvasWidth: number;
  canvasHeight: number;
  maxZoom: number;
  minZoom: number;
};

export const DEFAULT_AI_TRACKING_CONFIG: AiTrackingConfig = {
  canvasWidth: 3840,
  canvasHeight: 2160,
  maxZoom: 3.5,
  minZoom: 1.0,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes the virtual PTZ framing crop for a given bounding box and FramingMode.
 */
export function calculateAiTrackingCrop(
  box: NormalizedBoundingBox | null | undefined,
  mode: FramingMode = "normal",
  speed: TrackingSpeed = "standard",
  config: AiTrackingConfig = DEFAULT_AI_TRACKING_CONFIG
): VirtualPtzState {
  const isSport = speed === "sport";
  const defaultPtz: VirtualPtzState = {
    zoomFactor: 1.0,
    panOffsetX: 0,
    panOffsetY: 0,
    zoomSpeed: isSport ? 9 : 5,
    speedMode: isSport ? "sport" : "fine",
  };

  if (!box || mode === "camera" || mode === "wide") {
    return defaultPtz;
  }

  const { canvasWidth, canvasHeight, maxZoom, minZoom } = config;

  let cropX = box.x;
  let cropY = box.y;
  let cropW = box.width;
  let cropH = box.height;
  let padding = 1.35;

  switch (mode) {
    case "upper_body": {
      // Top 55% of the person: head, shoulders, chest, waist
      cropH = Math.max(0.08, box.height * 0.55);
      cropW = Math.max(0.08, box.width * 1.05);
      cropX = box.x - (cropW - box.width) / 2;
      padding = 1.25;
      break;
    }
    case "close_up":
    case "close": {
      // Top 28% of the person: tight head and face
      cropH = Math.max(0.06, box.height * 0.28);
      cropW = Math.max(0.06, box.width * 0.75);
      cropX = box.x + box.width * 0.125;
      cropY = box.y;
      padding = 1.20;
      break;
    }
    case "headless": {
      // Waist-down to feet (no head)
      cropH = Math.max(0.08, box.height * 0.50);
      cropW = Math.max(0.08, box.width * 1.05);
      cropX = box.x - (cropW - box.width) / 2;
      cropY = box.y + box.height * 0.50;
      padding = 1.25;
      break;
    }
    case "lower_body": {
      // Shins and floor
      cropH = Math.max(0.06, box.height * 0.35);
      cropW = Math.max(0.06, box.width * 1.10);
      cropX = box.x - (cropW - box.width) / 2;
      cropY = box.y + box.height * 0.65;
      padding = 1.30;
      break;
    }
    case "zone": {
      // Constrained within focal subzone (middle 70% of room)
      cropX = clamp(box.x, 0.1, 0.7);
      cropY = clamp(box.y, 0.1, 0.7);
      cropW = Math.min(0.8, Math.max(0.15, box.width));
      cropH = Math.min(0.8, Math.max(0.15, box.height));
      padding = 1.40;
      break;
    }
    case "normal":
    case "follow":
    default: {
      // Full body standard framing
      cropX = box.x;
      cropY = box.y;
      cropW = Math.max(0.1, box.width);
      cropH = Math.max(0.1, box.height);
      padding = 1.35;
      break;
    }
  }

  // Clamping effective normalized box within 0..1
  const safeW = clamp(cropW, 0.02, 1.0);
  const safeH = clamp(cropH, 0.02, 1.0);
  const safeX = clamp(cropX, 0.0, 1.0 - safeW);
  const safeY = clamp(cropY, 0.0, 1.0 - safeH);

  // Compute required zoom based on framing crop
  const requiredZoomX = 1.0 / (safeW * padding);
  const requiredZoomY = 1.0 / (safeH * padding);
  const rawZoom = Math.min(requiredZoomX, requiredZoomY);
  const zoomFactor = clamp(Number(rawZoom.toFixed(2)), minZoom, maxZoom);

  if (zoomFactor <= 1.05) {
    return defaultPtz;
  }

  // Viewport crop pixel dimensions
  const viewportW = canvasWidth / zoomFactor;
  const viewportH = canvasHeight / zoomFactor;

  // Center coordinate in canvas pixels
  const centerX = (safeX + safeW / 2) * canvasWidth;
  const centerY = (safeY + safeH / 2) * canvasHeight;

  // Clamped pan offsets so the crop never bleeds outside sensor bounds
  const maxPanX = Math.max(0, canvasWidth - viewportW);
  const maxPanY = Math.max(0, canvasHeight - viewportH);

  const panOffsetX = clamp(Math.round(centerX - viewportW / 2), 0, maxPanX);
  const panOffsetY = clamp(Math.round(centerY - viewportH / 2), 0, maxPanY);

  return {
    zoomFactor,
    panOffsetX,
    panOffsetY,
    zoomSpeed: isSport ? 9 : 5,
    speedMode: isSport ? "sport" : "fine",
  };
}

/**
 * Smoothly steps current PTZ toward target PTZ with speedMode-aware lerping.
 */
export function stepAiTrackingEngine(
  currentPtz: VirtualPtzState,
  targetPtz: VirtualPtzState,
  speed: TrackingSpeed = "standard"
): VirtualPtzState {
  const isSport = speed === "sport" || targetPtz.speedMode === "sport";
  const lerpFactor = isSport ? 0.40 : 0.14;

  const deltaZoom = targetPtz.zoomFactor - currentPtz.zoomFactor;
  const deltaX = targetPtz.panOffsetX - currentPtz.panOffsetX;
  const deltaY = targetPtz.panOffsetY - currentPtz.panOffsetY;

  // Snappy snap if already very close
  if (Math.abs(deltaZoom) < 0.02 && Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) {
    return { ...targetPtz, speedMode: isSport ? "sport" : "fine" };
  }

  const nextZoom = clamp(currentPtz.zoomFactor + deltaZoom * lerpFactor, 1.0, 3.5);
  const nextX = Math.round(currentPtz.panOffsetX + deltaX * lerpFactor);
  const nextY = Math.round(currentPtz.panOffsetY + deltaY * lerpFactor);

  return {
    zoomFactor: Number(nextZoom.toFixed(2)),
    panOffsetX: nextX,
    panOffsetY: nextY,
    zoomSpeed: isSport ? 9 : 5,
    speedMode: isSport ? "sport" : "fine",
  };
}

export function formatAiTrackingModeLabel(mode: FramingMode): string {
  switch (mode) {
    case "normal":
    case "follow":
      return "Normal Tracking";
    case "upper_body":
      return "Upper Body";
    case "close_up":
    case "close":
      return "Close-up";
    case "headless":
      return "Headless (Feet)";
    case "lower_body":
      return "Lower Body";
    case "zone":
      return "Zone Tracking";
    case "group":
      return "Group Cluster";
    case "camera":
    case "wide":
    default:
      return "Full Camera (Wide)";
  }
}

/**
 * Extracts the relevant normalized bounding box for the given subject mode.
 */
export function extractModeTargetBox(
  telemetry: CameraTelemetryInput | undefined,
  mode: SubjectMode
): NormalizedBoundingBox | null {
  if (!telemetry || !telemetry.boundingBoxes || telemetry.boundingBoxes.length === 0) {
    return null;
  }

  const boxes = telemetry.boundingBoxes;

  if (mode === "dog") {
    const dog = boxes.find(
      (b) =>
        b.label === "dog" ||
        b.targetName?.toLowerCase().includes("dog") ||
        b.targetName?.toLowerCase().includes("buster") ||
        b.targetName?.toLowerCase().includes("kona") ||
        b.targetName?.toLowerCase().includes("molly") ||
        b.targetName?.toLowerCase().includes("olly")
    );
    if (dog) return { x: dog.nx, y: dog.ny, width: dog.nw, height: dog.nh };
  }

  if (mode === "cat") {
    const cat = boxes.find(
      (b) =>
        b.label === "cat" ||
        b.targetName?.toLowerCase().includes("cat") ||
        b.targetName?.toLowerCase().includes("mochi") ||
        b.targetName?.toLowerCase().includes("shadow") ||
        b.targetName?.toLowerCase().includes("kitty")
    );
    if (cat) return { x: cat.nx, y: cat.ny, width: cat.nw, height: cat.nh };
  }

  if (mode === "member" || mode === "face") {
    const member = boxes.find(
      (b) =>
        b.label === "member" ||
        (b.targetName && b.targetName.length > 0) ||
        b.label === "person"
    );
    if (member) return { x: member.nx, y: member.ny, width: member.nw, height: member.nh };
  }

  if (mode === "group" || mode === "crowd") {
    const personBoxes = boxes.filter(
      (b) => !b.label || b.label === "person" || b.label === "member" || b.category === "people"
    );
    if (personBoxes.length > 0) {
      let minX = 1.0, minY = 1.0, maxX = 0.0, maxY = 0.0;
      for (const b of personBoxes) {
        minX = Math.min(minX, b.nx);
        minY = Math.min(minY, b.ny);
        maxX = Math.max(maxX, b.nx + b.nw);
        maxY = Math.max(maxY, b.ny + b.nh);
      }
      return {
        x: minX,
        y: minY,
        width: Math.max(0.1, maxX - minX),
        height: Math.max(0.1, maxY - minY),
      };
    }
  }

  if (mode === "feet") {
    const footBox = boxes.find(
      (b) => b.label === "feet" || b.label === "foot" || (b as any).category === "feet"
    );
    if (footBox) return { x: footBox.nx, y: footBox.ny, width: footBox.nw, height: footBox.nh };
  }

  const primary = boxes.find((b) => b.label === "person" || b.category === "people") || boxes[0];
  return primary ? { x: primary.nx, y: primary.ny, width: primary.nw, height: primary.nh } : null;
}

export type NextRoomPrediction = {
  activeCameraId: string;
  activeRoomName: string;
  activeScore: number;
  challengerCameraId: string | null;
  challengerRoomName: string | null;
  challengerScore: number;
  scoreDelta: number;
  switchThreshold: number;
  dwellRemainingMs: number;
  cutReadiness: number; // 0..1
  willCut: boolean;
  predictedZoom: number;
  predictedFramingLabel: string;
  cutReason: string;
  isRoomLocked: boolean;
};

/**
 * Calculates predictive next room, candidate score differential, cut readiness, and next zoom.
 */
export function calculatePotentialNextRoom(params: {
  activeCameraId: string;
  activeRoomName: string;
  subjectMode: SubjectMode;
  framingMode: FramingMode;
  speedMode: TrackingSpeed;
  inputs: CameraTelemetryInput[];
  cameras: Array<{ id: string; name: string; slug?: string; kind?: string }>;
  isRoomLocked: boolean;
  shotStartedAt: number;
  challengerId: string | null;
  challengerSince: number | null;
  now?: number;
}): NextRoomPrediction {
  const {
    activeCameraId,
    activeRoomName,
    subjectMode,
    framingMode,
    speedMode,
    inputs,
    cameras,
    isRoomLocked,
    shotStartedAt,
    challengerId,
    challengerSince,
    now = Date.now(),
  } = params;

  const activeInput = inputs.find((i) => i.cameraId === activeCameraId) || {
    cameraId: activeCameraId,
    peopleCount: 0,
    visibleFeetCount: 0,
    feetConfidence: 0,
    faceCount: 0,
    motionScore: 0,
    audioPeak: 0,
    isSpeaking: false,
  };

  const activeTileBounds: CameraTileBounds = {
    cameraId: activeCameraId,
    cameraName: activeRoomName,
    slug: activeRoomName.toLowerCase().replace(/\s+/g, "-"),
    kind: "ipcam",
    nativeResolution: { width: 3840, height: 2160 },
    row: 0,
    col: 0,
    unitSlot: { uX: 0, uY: 0, unitsWide: 4, unitsHigh: 4 },
    xMin: 0,
    yMin: 0,
    xMax: 3840,
    yMax: 2160,
    proxyXMin: 0,
    proxyYMin: 0,
  };

  const activeScoreResult = calculateCameraScore(activeTileBounds, activeInput, subjectMode);
  const activeScore = activeScoreResult.score;

  // Filter challenger candidates (all other cameras)
  const candidateCameras = cameras.filter((c) => c.id !== activeCameraId);
  const candidateScores = candidateCameras.map((c) => {
    const inp = inputs.find((i) => i.cameraId === c.id) || {
      cameraId: c.id,
      peopleCount: 0,
      visibleFeetCount: 0,
      feetConfidence: 0,
      faceCount: 0,
      motionScore: 0,
      audioPeak: 0,
      isSpeaking: false,
    };
    const bounds: CameraTileBounds = {
      cameraId: c.id,
      cameraName: c.name,
      slug: c.slug || c.id,
      kind: (c.kind as any) || "ipcam",
      nativeResolution: { width: 3840, height: 2160 },
      row: 0,
      col: 0,
      unitSlot: { uX: 0, uY: 0, unitsWide: 4, unitsHigh: 4 },
      xMin: 0,
      yMin: 0,
      xMax: 3840,
      yMax: 2160,
      proxyXMin: 0,
      proxyYMin: 0,
    };
    return {
      camera: c,
      telemetry: inp,
      scoreResult: calculateCameraScore(bounds, inp, subjectMode),
    };
  });

  candidateScores.sort((a, b) => b.scoreResult.score - a.scoreResult.score);
  const highest = candidateScores[0];

  if (!highest) {
    return {
      activeCameraId,
      activeRoomName,
      activeScore,
      challengerCameraId: null,
      challengerRoomName: null,
      challengerScore: 0,
      scoreDelta: 0,
      switchThreshold: 15,
      dwellRemainingMs: 0,
      cutReadiness: 0,
      willCut: false,
      predictedZoom: 1.0,
      predictedFramingLabel: formatAiTrackingModeLabel(framingMode),
      cutReason: "No other cameras available in atlas",
      isRoomLocked,
    };
  }

  const challengerCameraId = highest.camera.id;
  const challengerRoomName = highest.camera.name;
  const challengerScore = highest.scoreResult.score;
  const scoreDelta = challengerScore - activeScore;

  const isAudioMode = subjectMode === "speaker";
  const switchThreshold = isAudioMode ? 10 : 15;
  const minChallengerHold = isAudioMode ? 500 : 1500;
  const minShotHold = isAudioMode ? 1800 : 3500;

  const challengerDuration =
    challengerId === challengerCameraId && challengerSince ? now - challengerSince : 0;
  const shotDuration = now - shotStartedAt;

  const remainingChallengerDwell = Math.max(0, minChallengerHold - challengerDuration);
  const remainingShotDwell = Math.max(0, minShotHold - shotDuration);
  const dwellRemainingMs = Math.max(remainingChallengerDwell, remainingShotDwell);

  const totalRequiredTime = Math.max(minChallengerHold, minShotHold);
  const cutReadiness =
    scoreDelta >= switchThreshold
      ? clamp(1.0 - dwellRemainingMs / totalRequiredTime, 0, 1)
      : clamp(scoreDelta / switchThreshold, 0, 0.8);

  const willCut =
    !isRoomLocked &&
    scoreDelta >= switchThreshold &&
    challengerDuration >= minChallengerHold &&
    shotDuration >= minShotHold;

  // Calculate predicted PTZ crop for the challenger's target subject
  const challengerTargetBox = extractModeTargetBox(highest.telemetry, subjectMode);
  const predictedPtz = calculateAiTrackingCrop(challengerTargetBox, framingMode, speedMode);
  const predictedZoom = predictedPtz.zoomFactor;
  const predictedFramingLabel = formatAiTrackingModeLabel(framingMode);

  let cutReason = "";
  if (isRoomLocked) {
    cutReason = `🔒 ROOM LOCKED to ${activeRoomName} · Cuts suppressed · PTZ active in room`;
  } else if (willCut) {
    cutReason = `⚡ CUT IMMINENT: ${challengerRoomName} holds sustained +${scoreDelta} pts lead`;
  } else if (scoreDelta >= switchThreshold) {
    cutReason = `Challenger ${challengerRoomName} leading (+${scoreDelta} pts) · Dwell hold ${(dwellRemainingMs / 1000).toFixed(1)}s`;
  } else {
    cutReason = `Holding ${activeRoomName} · Lead delta +${scoreDelta > 0 ? scoreDelta : 0} pts (Need +${switchThreshold} pts)`;
  }

  return {
    activeCameraId,
    activeRoomName,
    activeScore,
    challengerCameraId,
    challengerRoomName,
    challengerScore,
    scoreDelta,
    switchThreshold,
    dwellRemainingMs,
    cutReadiness: Number(cutReadiness.toFixed(2)),
    willCut,
    predictedZoom,
    predictedFramingLabel,
    cutReason,
    isRoomLocked,
  };
}


/**
 * Every box the subject mode could be framing, for the gimbal's aim to choose
 * between by continuity (director/gimbal.ts pickSubject). `extractModeTargetBox`
 * returns only the first match, which in a room with two dogs -- or a named and
 * an unnamed box for the same dog -- flipped the shot between them.
 */
export function extractModeCandidates(
  telemetry: CameraTelemetryInput | undefined,
  mode: SubjectMode,
  followName?: string | null,
): NormalizedBoundingBox[] {
  const boxes = telemetry?.boundingBoxes ?? [];
  if (boxes.length === 0) return [];
  const toBox = (b: (typeof boxes)[number]): NormalizedBoundingBox => ({ x: b.nx, y: b.ny, width: b.nw, height: b.nh });
  const named = (b: (typeof boxes)[number]) => b.targetName?.trim().toLowerCase() ?? "";

  if (mode === "group" || mode === "crowd") {
    const one = extractModeTargetBox(telemetry, mode);
    return one ? [one] : [];
  }
  const pick = (test: (b: (typeof boxes)[number]) => boolean) => boxes.filter(test).map(toBox);
  // Following someone by name: their box when they are named here; otherwise
  // only bodies nobody has named -- never a body named as someone else. The
  // fallback to "any person" framed Malia up close while Tyler was in the
  // kitchen (2026-09-19).
  if (followName) {
    const theirs = pick((b) => named(b) === followName.toLowerCase());
    if (theirs.length > 0) return theirs;
    const isPerson = (b: (typeof boxes)[number]) => b.label === "person" || b.label === "member" || b.category === "people";
    return pick((b) => isPerson(b) && !named(b));
  }
  if (mode === "dog") return pick((b) => b.label === "dog");
  if (mode === "cat") return pick((b) => b.label === "cat");
  if (mode === "animals") return pick((b) => b.label === "dog" || b.label === "cat");
  if (mode === "feet") return pick((b) => b.label === "feet" || b.label === "foot");
  const people = pick((b) => b.label === "person" || b.label === "member" || b.category === "people");
  if (people.length > 0) return people;
  const one = extractModeTargetBox(telemetry, mode);
  return one ? [one] : [];
}
