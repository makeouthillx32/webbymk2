// src/zones/tank/server/directorMovementLogStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank Director Kinematics & Movement Telemetry Harness (Silent Logs)
//
// Collects high-frequency spatial vectors, pan/tilt trajectories, room snaps,
// and FOV zooms across manual pilot, OSC, and autonomous AI modes.
// Serves as calibration & training data for TouchDesigner choreography,
// automated Focus inspection paths, and item-triggered camera moves.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementEventType =
  | "joystick_vector"
  | "ptz_pan"
  | "ptz_zoom"
  | "preset_jump"
  | "room_snap"
  | "osc_command"
  | "focus_inspect"
  | "focus_restore"
  | "item_trigger"
  | "auto_cut";

export type DirectorMovementLogEntry = {
  id: string;
  timestamp: number;
  isoTime: string;
  eventType: MovementEventType;
  operator: {
    user: string;
    connectionType: string;
    sessionId?: string;
  };
  source: {
    roomId: string;
    cameraName: string;
    panX: number;
    panY: number;
    zoom: number;
  };
  target?: {
    roomId?: string;
    cameraName?: string;
    panX?: number;
    panY?: number;
    zoom?: number;
  };
  trajectory: {
    vx: number;
    vy: number;
    deltaX: number;
    deltaY: number;
    deltaZoom: number;
    durationMs?: number;
    easingCurve?: string;
  };
  roomContext?: {
    motionScore?: number;
    audioPeak?: number;
    detectedMembers?: string[];
    detectedPets?: string[];
    boundingBoxCount?: number;
  };
};

const MAX_LOG_ENTRIES = 1000;
const g_movementLogs: DirectorMovementLogEntry[] = [];
let g_logCounter = 0;

/**
 * Records a single movement telemetry entry into the circular buffer.
 */
export function recordMovementLog(
  entry: Omit<DirectorMovementLogEntry, "id" | "timestamp" | "isoTime">
): DirectorMovementLogEntry {
  const now = Date.now();
  g_logCounter += 1;

  const fullEntry: DirectorMovementLogEntry = {
    ...entry,
    id: "mv-" + now + "-" + g_logCounter,
    timestamp: now,
    isoTime: new Date(now).toISOString(),
  };

  g_movementLogs.push(fullEntry);
  if (g_movementLogs.length > MAX_LOG_ENTRIES) {
    g_movementLogs.shift();
  }

  return fullEntry;
}

/**
 * Ingests a batch of movement entries from client telemetry.
 */
export function recordMovementBatch(
  entries: Array<Omit<DirectorMovementLogEntry, "id" | "timestamp" | "isoTime">>
): number {
  for (const entry of entries) {
    recordMovementLog(entry);
  }
  return entries.length;
}

/**
 * Retrieves the recent movement log buffer.
 */
export function getRecentMovementLogs(limit = 200): {
  count: number;
  totalRecorded: number;
  logs: DirectorMovementLogEntry[];
  summary: {
    joystickVectors: number;
    roomSnaps: number;
    ptzZooms: number;
    cuts: number;
  };
} {
  const slice = g_movementLogs.slice(-Math.min(limit, MAX_LOG_ENTRIES));

  let joystickVectors = 0;
  let roomSnaps = 0;
  let ptzZooms = 0;
  let cuts = 0;

  for (const log of g_movementLogs) {
    if (log.eventType === "joystick_vector" || log.eventType === "ptz_pan") joystickVectors++;
    else if (log.eventType === "room_snap") roomSnaps++;
    else if (log.eventType === "ptz_zoom" || log.eventType === "preset_jump") ptzZooms++;
    else if (log.eventType === "auto_cut") cuts++;
  }

  return {
    count: slice.length,
    totalRecorded: g_logCounter,
    logs: slice,
    summary: {
      joystickVectors,
      roomSnaps,
      ptzZooms,
      cuts,
    },
  };
}

/**
 * Clears the in-memory log buffer (useful for test resets).
 */
export function __resetMovementLogs(): void {
  g_movementLogs.length = 0;
  g_logCounter = 0;
}
