// src/zones/tank/server/directorVirtualAtlas.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank Virtual Canvas & AI Vision Director Engine
//
// Manages the deterministic 49.8 MP Video Atlas (11,520 x 4,320) across 6 cameras,
// proxy inference normalization, pose/foot/speaker/chaos scoring heuristics,
// and smooth cinematography transitions (SNAP vs TRACK).
// ─────────────────────────────────────────────────────────────────────────────

export type SubjectMode =
  | "auto"
  | "person"
  | "speaker"
  | "feet"
  | "face"
  | "motion"
  | "crowd"
  | "chaos"
  | "manual"
  | "rotation";

export type FramingMode = "camera" | "group" | "follow" | "close" | "wide";

export type MotionCurve = "snap" | "track";

export type CameraKind = "ipcam" | "irlcam" | "usbcam" | "obs" | "unknown";

export type DetectionCategoryFilters = {
  trash: boolean;
  clutter: boolean;
  easterEgg: boolean;
  waldo: boolean;
  people: boolean;
  audio: boolean;
  feet: boolean;
};

export const DEFAULT_DETECTION_FILTERS: DetectionCategoryFilters = {
  trash: true,
  clutter: true,
  easterEgg: true,
  waldo: true,
  people: true,
  audio: true,
  feet: false,
};

export type CameraTileBounds = {
  cameraId: string;
  cameraName: string;
  slug: string;
  kind: CameraKind;
  nativeResolution: { width: number; height: number };
  row: number; // 0 or 1
  col: number; // 0, 1, or 2
  unitSlot: {
    uX: number;
    uY: number;
    unitsWide: number; // Standard 4 units
    unitsHigh: number; // Standard 4 units
  };
  xMin: number; // e.g. 0, 3840, 7680
  yMin: number; // e.g. 0, 2160
  xMax: number; // e.g. 3840, 7680, 11520
  yMax: number; // e.g. 2160, 4320
  proxyXMin: number; // 0, 640, 1280
  proxyYMin: number; // 0, 360
};

export type GridDimensions = {
  cols: number;
  rows: number;
  totalSlots: number;
  emptySlots: number;
};

/**
 * computeOptimalGridDimensions
 * 
 * Computes optimal (cols, rows) to maintain a compact square or balanced
 * rectangle bounding shape regardless of camera count (4 -> 2x2, 6 -> 3x2, 12 -> 4x3).
 */
export function computeOptimalGridDimensions(count: number): GridDimensions {
  if (count <= 0) return { cols: 1, rows: 1, totalSlots: 1, emptySlots: 1 };
  if (count === 1) return { cols: 1, rows: 1, totalSlots: 1, emptySlots: 0 };
  if (count === 2) return { cols: 2, rows: 1, totalSlots: 2, emptySlots: 0 };
  if (count === 3 || count === 4) return { cols: 2, rows: 2, totalSlots: 4, emptySlots: 4 - count };
  if (count === 5 || count === 6) return { cols: 3, rows: 2, totalSlots: 6, emptySlots: 6 - count };
  if (count >= 7 && count <= 9) return { cols: 3, rows: 3, totalSlots: 9, emptySlots: 9 - count };
  if (count >= 10 && count <= 12) return { cols: 4, rows: 3, totalSlots: 12, emptySlots: 12 - count };
  if (count >= 13 && count <= 16) return { cols: 4, rows: 4, totalSlots: 16, emptySlots: 16 - count };
  if (count >= 17 && count <= 20) return { cols: 5, rows: 4, totalSlots: 20, emptySlots: 20 - count };
  if (count >= 21 && count <= 25) return { cols: 5, rows: 5, totalSlots: 25, emptySlots: 25 - count };

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return {
    cols,
    rows,
    totalSlots: cols * rows,
    emptySlots: cols * rows - count,
  };
}

export type DynamicAtlasLayout = {
  grid: GridDimensions;
  canvasWidth: number;
  canvasHeight: number;
  proxyWidth: number;
  proxyHeight: number;
  totalUnitsX: number;
  totalUnitsY: number;
  tiles: CameraTileBounds[];
};

/**
 * computeDynamicAtlasLayout
 * 
 * Dynamically computes coordinate origins, proxy offsets, and unit slots for any camera list.
 */
export function computeDynamicAtlasLayout(
  cameras: Array<{
    id: string;
    name: string;
    slug?: string;
    kind?: CameraKind;
    nativeResolution?: { width: number; height: number };
  }>
): DynamicAtlasLayout {
  const count = Math.max(1, cameras.length);
  const grid = computeOptimalGridDimensions(count);

  const TILE_WIDTH = 3840;
  const TILE_HEIGHT = 2160;
  const PROXY_TILE_WIDTH = 640;
  const PROXY_TILE_HEIGHT = 360;
  const UNITS_PER_SLOT = 4;

  const canvasWidth = grid.cols * TILE_WIDTH;
  const canvasHeight = grid.rows * TILE_HEIGHT;
  const proxyWidth = grid.cols * PROXY_TILE_WIDTH;
  const proxyHeight = grid.rows * PROXY_TILE_HEIGHT;
  const totalUnitsX = grid.cols * UNITS_PER_SLOT;
  const totalUnitsY = grid.rows * UNITS_PER_SLOT;

  const tiles: CameraTileBounds[] = cameras.map((cam, index) => {
    const col = index % grid.cols;
    const row = Math.floor(index / grid.cols);

    const xMin = col * TILE_WIDTH;
    const yMin = row * TILE_HEIGHT;
    const xMax = xMin + TILE_WIDTH;
    const yMax = yMin + TILE_HEIGHT;

    const proxyXMin = col * PROXY_TILE_WIDTH;
    const proxyYMin = row * PROXY_TILE_HEIGHT;

    const uX = col * UNITS_PER_SLOT;
    const uY = row * UNITS_PER_SLOT;

    return {
      cameraId: cam.id,
      cameraName: cam.name,
      slug: cam.slug || cam.id,
      // Kind comes from the caller, which derives it from the ingest protocol.
      // This used to sniff substrings out of the camera id and fall through to
      // "ipcam" for anything unrecognised — so an unfamiliar USB or OBS camera
      // silently passed as an IP camera. Unknown now stays unknown.
      kind: cam.kind ?? "unknown",
      nativeResolution: cam.nativeResolution || { width: 3840, height: 2160 },
      row,
      col,
      unitSlot: {
        uX,
        uY,
        unitsWide: UNITS_PER_SLOT,
        unitsHigh: UNITS_PER_SLOT,
      },
      xMin,
      yMin,
      xMax,
      yMax,
      proxyXMin,
      proxyYMin,
    };
  });

  return {
    grid,
    canvasWidth,
    canvasHeight,
    proxyWidth,
    proxyHeight,
    totalUnitsX,
    totalUnitsY,
    tiles,
  };
}

export const DEFAULT_CAMERA_TILES: CameraTileBounds[] = [
  {
    cameraId: "cam-1",
    cameraName: "Game Room",
    slug: "game-room",
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
  },
  {
    cameraId: "cam-2",
    cameraName: "Living Room",
    slug: "living-room",
    kind: "ipcam",
    nativeResolution: { width: 3840, height: 2160 },
    row: 0,
    col: 1,
    unitSlot: { uX: 4, uY: 0, unitsWide: 4, unitsHigh: 4 },
    xMin: 3840,
    yMin: 0,
    xMax: 7680,
    yMax: 2160,
    proxyXMin: 640,
    proxyYMin: 0,
  },
  {
    cameraId: "cam-3",
    cameraName: "The Foyer",
    slug: "foyer",
    kind: "ipcam",
    nativeResolution: { width: 1920, height: 1080 },
    row: 0,
    col: 2,
    unitSlot: { uX: 8, uY: 0, unitsWide: 4, unitsHigh: 4 },
    xMin: 7680,
    yMin: 0,
    xMax: 11520,
    yMax: 2160,
    proxyXMin: 1280,
    proxyYMin: 0,
  },
  {
    cameraId: "cam-4",
    cameraName: "Makeup Room",
    slug: "makeup-room",
    kind: "ipcam",
    nativeResolution: { width: 1920, height: 1080 },
    row: 1,
    col: 0,
    unitSlot: { uX: 0, uY: 4, unitsWide: 4, unitsHigh: 4 },
    xMin: 0,
    yMin: 2160,
    xMax: 3840,
    yMax: 4320,
    proxyXMin: 0,
    proxyYMin: 360,
  },
  {
    cameraId: "cam-5",
    cameraName: "Game Room 2",
    slug: "game-room-2",
    kind: "ipcam",
    nativeResolution: { width: 3840, height: 2160 },
    row: 1,
    col: 1,
    unitSlot: { uX: 4, uY: 4, unitsWide: 4, unitsHigh: 4 },
    xMin: 3840,
    yMin: 2160,
    xMax: 7680,
    yMax: 4320,
    proxyXMin: 640,
    proxyYMin: 360,
  },
  {
    cameraId: "cam-6",
    cameraName: "Kitchen",
    slug: "kitchen",
    kind: "ipcam",
    nativeResolution: { width: 1080, height: 1920 },
    row: 1,
    col: 2,
    unitSlot: { uX: 8, uY: 4, unitsWide: 4, unitsHigh: 4 },
    xMin: 7680,
    yMin: 2160,
    xMax: 11520,
    yMax: 4320,
    proxyXMin: 1280,
    proxyYMin: 360,
  },
];

export type DepthZone = "foreground" | "midground" | "background";

export type RoomDepthCalibration = {
  nearY: number; // Ground plane horizon / near cut (e.g. 0.85)
  farY: number;  // Deep room vanishing horizon (e.g. 0.20)
  scaleNear: number; // Perspective scale at bottom of screen (e.g. 1.0)
  scaleFar: number;  // Perspective scale at top vanishing line (e.g. 0.35)
  quantizedBins: 4 | 8 | 16; // Quantized depth bins for fast spatial grouping
};

export type RoomLightingState = "daylight" | "warm_ambient" | "dim_evening" | "ir_night_vision";

export type RoomLightingTelemetry = {
  luxScore: number; // 0 to 1000 lux estimate
  lumaMean: number; // 0.00 to 1.00 normalized frame brightness
  isIrNightMode: boolean; // True when IR illuminator / B&W sensor is engaged
  contrastRatio: number; // 1.0 to 10.0
  colorTempKelvin: number; // 2700K (Warm) to 6500K (Daylight)
  lightingState: RoomLightingState;
};

export type CameraTelemetryInput = {
  cameraId: string;
  peopleCount: number;
  visibleFeetCount: number;
  feetConfidence: number;
  faceCount: number;
  motionScore: number; // 0.0 to 1.0
  audioPeak: number; // 0 to 100
  isSpeaking: boolean;
  itemTriggerCount?: number;
  targetMemberDetected?: string | null; // e.g. "@admin", "Housemate #1"
  targetMemberConfidence?: number; // 0.0 to 1.0
  // Quantized Room Depth & Perspective Telemetry
  depthZone?: DepthZone;
  quantizedDepthBin?: number; // 0 (Closest FG) to 7 (Furthest BG)
  depthScalingFactor?: number; // 0.35 (Far) to 1.00 (Near)
  // Room Light Perception & IR Night Vision
  lighting?: RoomLightingTelemetry;
  boundingBoxes?: Array<{
    nx: number;
    ny: number;
    nw: number;
    nh: number;
    label: string;
    depthZone?: DepthZone;
  }>;
};

/**
 * Computes quantized depth zone and perspective scaling factor
 */
export function calculateQuantizedDepth(
  ny: number,
  calibration?: Partial<RoomDepthCalibration>
): { zone: DepthZone; scale: number; bin: number } {
  const farY = calibration?.farY ?? 0.25;
  const nearY = calibration?.nearY ?? 0.85;
  const scaleFar = calibration?.scaleFar ?? 0.35;
  const scaleNear = calibration?.scaleNear ?? 1.0;

  // Normalized ground depth progress (0.0 = Far BG, 1.0 = Near FG)
  const clampedY = Math.max(0, Math.min(1, ny));
  const t = Math.max(0, Math.min(1, (clampedY - farY) / (nearY - farY)));

  // Quantized depth bin (0 to 7)
  const bin = Math.min(7, Math.floor(t * 8));

  // Perspective scale factor
  const scale = parseFloat((scaleFar + t * (scaleNear - scaleFar)).toFixed(3));

  // Categorical Depth Zone
  const zone: DepthZone = t > 0.65 ? "foreground" : t > 0.35 ? "midground" : "background";

  return { zone, scale, bin };
}

/**
 * Classifies room lighting and infrared night mode
 */
export function classifyRoomLighting(
  lumaMean: number,
  isIrNightMode = false
): RoomLightingTelemetry {
  const clampedLuma = Math.max(0, Math.min(1, lumaMean));
  const isNight = isIrNightMode || clampedLuma < 0.15;
  const luxScore = isNight
    ? Math.round(clampedLuma * 30)
    : clampedLuma > 0.7
    ? Math.round(500 + (clampedLuma - 0.7) * 1600)
    : Math.round(clampedLuma * 700);

  const lightingState: RoomLightingState = isNight
    ? "ir_night_vision"
    : clampedLuma < 0.35
    ? "dim_evening"
    : clampedLuma < 0.65
    ? "warm_ambient"
    : "daylight";

  const colorTempKelvin = isNight ? 5000 : clampedLuma > 0.6 ? 6000 : 3200;
  const contrastRatio = isNight ? 2.5 : parseFloat((3.0 + clampedLuma * 4.0).toFixed(1));

  return {
    luxScore,
    lumaMean: clampedLuma,
    isIrNightMode: isNight,
    contrastRatio,
    colorTempKelvin,
    lightingState,
  };
}

export type CalculatedCameraScore = {
  tile: CameraTileBounds;
  telemetry: CameraTelemetryInput;
  score: number;
  breakdown: Record<string, number>;
};

export type DirectorViewportState = {
  activeCameraId: string;
  activeCameraSlug: string;
  subjectMode: SubjectMode;
  framingMode: FramingMode;
  motionCurve: MotionCurve;
  viewportX: number; // 0 to 11520
  viewportY: number; // 0 to 4320
  viewportWidth: number;
  viewportHeight: number;
  zoomFactor: number;
  currentScore: number;
  shotStartedAt: number;
  challengerId: string | null;
  challengerSince: number | null;
  scores: CalculatedCameraScore[];
  /**
   * Operator-picked camera IDs for "rotation" mode — e.g. spotlighting one
   * or two specific streamers on a fixed timer instead of leaving room
   * selection to the (currently telemetry-starved) heuristic scorer.
   * Ignored in every other subjectMode.
   */
  rotationCameraIds: string[];
  /** How long each camera in rotationCameraIds holds the shot. */
  rotationIntervalMs: number;
  /** Index into rotationCameraIds currently on screen. */
  rotationIndex: number;
  /** When the current rotation slot started holding the shot. */
  rotationSlotStartedAt: number | null;
};

/**
 * calculateCameraScore
 * 
 * Computes heuristic interest score for a single camera tile based on active Subject Mode.
 */
export function calculateCameraScore(
  tile: CameraTileBounds,
  telemetry: CameraTelemetryInput,
  subjectMode: SubjectMode,
  feedPriorities?: { irlPriority?: boolean; obsPriority?: boolean }
): CalculatedCameraScore {
  let score = 0;
  const breakdown: Record<string, number> = {};

  switch (subjectMode) {
    case "feet": {
      // Prioritizes pose ankle keypoints + confidence
      const feetScore = telemetry.visibleFeetCount * 15;
      const confScore = Math.round(telemetry.feetConfidence * 20);
      const audioSub = Math.round(telemetry.audioPeak * 0.15);
      score = feetScore + confScore + audioSub;
      breakdown.feet = feetScore;
      breakdown.confidence = confScore;
      breakdown.audio = audioSub;
      break;
    }
    case "speaker": {
      // Prioritizes voice activity detection + speech probability
      const audioScore = Math.round(telemetry.audioPeak * 0.6);
      const speakBonus = telemetry.isSpeaking ? 35 : 0;
      const personBonus = telemetry.peopleCount > 0 ? 15 : 0;
      score = audioScore + speakBonus + personBonus;
      breakdown.audio = audioScore;
      breakdown.speaking = speakBonus;
      breakdown.person = personBonus;
      break;
    }
    case "crowd": {
      // Prioritizes the biggest group of people in a scene!
      // Quadratic group density reward: 1 person = 15 pts, 2 people = 75 pts, 3 people = 135 pts, 4 people = 200 pts
      const count = telemetry.peopleCount;
      const groupScore = count >= 2 ? Math.round(Math.pow(count, 1.6) * 32) : count * 15;
      const motionScore = Math.round(telemetry.motionScore * 20);
      const audioScore = Math.round(telemetry.audioPeak * 0.2);
      score = groupScore + motionScore + audioScore;
      breakdown.group = groupScore;
      breakdown.motion = motionScore;
      breakdown.audio = audioScore;
      break;
    }
    case "chaos": {
      // Prioritizes all sensors firing simultaneously + chat item drops
      const pScore = telemetry.peopleCount * 12;
      const aScore = Math.round(telemetry.audioPeak * 0.4);
      const mScore = Math.round(telemetry.motionScore * 25);
      const itemScore = (telemetry.itemTriggerCount || 0) * 40;
      score = pScore + aScore + mScore + itemScore;
      breakdown.people = pScore;
      breakdown.audio = aScore;
      breakdown.motion = mScore;
      breakdown.items = itemScore;
      break;
    }
    case "face": {
      // Defined Member / Facial Recognition Tracking Mode (VIP Item Tracking)
      const targetBonus = telemetry.targetMemberDetected ? 110 : 0;
      const faceScore = (telemetry.faceCount || 1) * 30;
      const confScore = Math.round((telemetry.targetMemberConfidence || 0.95) * 20);
      score = targetBonus + faceScore + confScore;
      breakdown.targetMember = targetBonus;
      breakdown.faces = faceScore;
      breakdown.confidence = confScore;
      break;
    }
    case "person":
    case "auto":
    default: {
      // Balanced director heuristic
      const pScore = telemetry.peopleCount * 20;
      const aScore = Math.round(telemetry.audioPeak * 0.35);
      const mScore = Math.round(telemetry.motionScore * 15);
      score = pScore + aScore + mScore;
      breakdown.people = pScore;
      breakdown.audio = aScore;
      breakdown.motion = mScore;
      break;
    }
  }

  // IRL and OBS rooms are dynamic operator/creator-driven content.
  // When Priority is toggled ON (default: true), live IRL or OBS feeds receive
  // priority routing (+500 pts) so Director cleanly takes them live.
  // When toggled OFF, they behave as standard room feeds.
  const isIrl = tile.kind === "irlcam" || tile.cameraId.includes("irl") || tile.slug.includes("irl");
  const isObs = tile.kind === "obs" || tile.cameraId.includes("obs") || tile.slug.includes("obs");

  const irlActivePriority = feedPriorities?.irlPriority ?? true;
  const obsActivePriority = feedPriorities?.obsPriority ?? true;

  if (isIrl && irlActivePriority) {
    const priorityBonus = 500;
    score += priorityBonus;
    breakdown.irlPriority = priorityBonus;
  } else if (isObs && obsActivePriority) {
    const priorityBonus = 500;
    score += priorityBonus;
    breakdown.obsPriority = priorityBonus;
  } else if (tile.kind === "irlcam" || tile.kind === "obs") {
    const specialContentBonus = 15;
    score += specialContentBonus;
    breakdown.specialContent = specialContentBonus;
  }

  return {
    tile,
    telemetry,
    score,
    breakdown,
  };
}

/**
 * evaluateDirectorStep
 * 
 * Advances the director state machine by 1 frame with hysteresis, minimum shot duration,
 * and cinematography boundary clamping.
 */
export function evaluateDirectorStep(
  currentState: DirectorViewportState,
  inputs: CameraTelemetryInput[],
  customTiles?: CameraTileBounds[],
  now = Date.now()
): DirectorViewportState {
  if (currentState.subjectMode === "manual") {
    return currentState;
  }

  const activeTiles = customTiles && customTiles.length > 0 ? customTiles : DEFAULT_CAMERA_TILES;

  // 1. Calculate scores for all active cameras
  const scores = activeTiles.map((tile) => {
    const telemetry = inputs.find((i) => i.cameraId === tile.cameraId) || {
      cameraId: tile.cameraId,
      peopleCount: 0,
      visibleFeetCount: 0,
      feetConfidence: 0,
      faceCount: 0,
      motionScore: 0,
      audioPeak: 0,
      isSpeaking: false,
    };
    return calculateCameraScore(tile, telemetry, currentState.subjectMode);
  });

  scores.sort((a, b) => b.score - a.score);
  const highestCandidate = scores[0] || {
    tile: activeTiles[0],
    score: 0,
    breakdown: {},
    telemetry: inputs[0],
  };

  const shotDuration = now - currentState.shotStartedAt;
  const currentTileScore =
    scores.find((s) => s.tile.cameraId === currentState.activeCameraId)?.score || 0;

  let newActiveId = currentState.activeCameraId;
  let newActiveSlug = currentState.activeCameraSlug;
  let newShotStartedAt = currentState.shotStartedAt;
  let challengerId = currentState.challengerId;
  let challengerSince = currentState.challengerSince;
  let newRotationIndex = currentState.rotationIndex;
  let newRotationSlotStartedAt = currentState.rotationSlotStartedAt;

  // "rotation" is a deterministic timer, not a heuristic — the operator
  // picked exactly who should be on screen (e.g. spotlighting one or two
  // specific streamers) rather than trusting a scorer that has no real
  // detection telemetry to work from yet. Bypasses the score-based
  // challenger/idle logic below entirely; scores above are still computed
  // so the UI's breakdown panel has something real to show, they just
  // don't drive the cut decision in this mode.
  if (currentState.subjectMode === "rotation" && currentState.rotationCameraIds.length > 0) {
    const list = currentState.rotationCameraIds;
    const slotStartedAt = newRotationSlotStartedAt ?? now;
    const slotElapsed = now - slotStartedAt;

    if (newRotationSlotStartedAt === null) {
      newRotationSlotStartedAt = now;
    } else if (slotElapsed >= currentState.rotationIntervalMs) {
      newRotationIndex = (newRotationIndex + 1) % list.length;
      newRotationSlotStartedAt = now;
    }

    const rotationCameraId = list[newRotationIndex] ?? list[0];
    const rotationTile =
      activeTiles.find((t) => t.cameraId === rotationCameraId) ?? activeTiles[0];

    if (rotationTile.cameraId !== currentState.activeCameraId) {
      newActiveId = rotationTile.cameraId;
      newActiveSlug = rotationTile.slug;
      newShotStartedAt = now;
    }

    const activeTile = rotationTile;
    let targetX = activeTile.xMin;
    let targetY = activeTile.yMin;
    let finalX = targetX;
    let finalY = targetY;
    if (currentState.motionCurve === "track" && currentState.activeCameraId === newActiveId) {
      const easing = 0.08;
      finalX = Math.round(currentState.viewportX + (targetX - currentState.viewportX) * easing);
      finalY = Math.round(currentState.viewportY + (targetY - currentState.viewportY) * easing);
    }

    return {
      activeCameraId: newActiveId,
      activeCameraSlug: newActiveSlug,
      subjectMode: currentState.subjectMode,
      framingMode: currentState.framingMode,
      motionCurve: currentState.motionCurve,
      viewportX: finalX,
      viewportY: finalY,
      viewportWidth: 3840,
      viewportHeight: 2160,
      zoomFactor: 1,
      currentScore: currentTileScore,
      shotStartedAt: newShotStartedAt,
      challengerId: null,
      challengerSince: null,
      scores,
      rotationCameraIds: currentState.rotationCameraIds,
      rotationIntervalMs: currentState.rotationIntervalMs,
      rotationIndex: newRotationIndex,
      rotationSlotStartedAt: newRotationSlotStartedAt,
    };
  }

  // 2. Check if a challenger exceeds the threshold
  if (highestCandidate.tile.cameraId !== currentState.activeCameraId) {
    const scoreDiff = highestCandidate.score - currentTileScore;
    const isAudioMode = currentState.subjectMode === "speaker";
    const requiredDiff = isAudioMode ? 10 : 15;
    const minChallengerHold = isAudioMode ? 500 : 1500;
    const minShotHold = isAudioMode ? 1800 : 3500;

    if (scoreDiff >= requiredDiff) {
      if (challengerId !== highestCandidate.tile.cameraId) {
        challengerId = highestCandidate.tile.cameraId;
        challengerSince = now;
      }

      const challengerDuration = now - (challengerSince || now);

      // Check if challenger held lead long enough AND minimum shot time satisfied
      if (
        challengerDuration >= minChallengerHold &&
        shotDuration >= minShotHold
      ) {
        // Cut / Snap to new camera!
        newActiveId = highestCandidate.tile.cameraId;
        newActiveSlug = highestCandidate.tile.slug;
        newShotStartedAt = now;
        challengerId = null;
        challengerSince = null;
      }
    } else {
      challengerId = null;
      challengerSince = null;
    }
  } else {
    challengerId = null;
    challengerSince = null;
  }

  // 3. Max Idle Timeout (forces cut if current camera has zero activity for >30s)
  if (shotDuration >= 30000 && currentTileScore < 10) {
    if (highestCandidate.score > currentTileScore) {
      newActiveId = highestCandidate.tile.cameraId;
      newActiveSlug = highestCandidate.tile.slug;
      newShotStartedAt = now;
    }
  }

  // 4. Compute Viewport Coordinates dynamically based on the active camera's tile bounds
  const activeTile =
    activeTiles.find((t) => t.cameraId === newActiveId) || activeTiles[0];

  let targetX = activeTile.xMin;
  let targetY = activeTile.yMin;
  let targetW = 3840;
  let targetH = 2160;

  // Virtual PTZ Smoothing (TRACK Mode vs SNAP Mode)
  let finalX = targetX;
  let finalY = targetY;

  if (currentState.motionCurve === "track" && currentState.activeCameraId === newActiveId) {
    const easing = 0.08;
    finalX = Math.round(currentState.viewportX + (targetX - currentState.viewportX) * easing);
    finalY = Math.round(currentState.viewportY + (targetY - currentState.viewportY) * easing);
  }

  return {
    activeCameraId: newActiveId,
    activeCameraSlug: newActiveSlug,
    subjectMode: currentState.subjectMode,
    framingMode: currentState.framingMode,
    motionCurve: currentState.motionCurve,
    viewportX: finalX,
    viewportY: finalY,
    viewportWidth: targetW,
    viewportHeight: targetH,
    zoomFactor: 1,
    currentScore: currentTileScore,
    shotStartedAt: newShotStartedAt,
    challengerId,
    challengerSince,
    scores,
    rotationCameraIds: currentState.rotationCameraIds,
    rotationIntervalMs: currentState.rotationIntervalMs,
    rotationIndex: newRotationIndex,
    rotationSlotStartedAt: newRotationSlotStartedAt,
  };
}
