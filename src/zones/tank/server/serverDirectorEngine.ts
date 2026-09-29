import { createAdminClient } from "@/utils/supabase/admin";
import { loadRotationRosterFromDb } from "./directorRotationStore";
import { pickRotationSlot, resolveRotationOrder } from "./rotationRoster";
import {
  getDirectorAttentionForWorker,
  DEFAULT_DIRECTOR_ATTENTION,
  getDirectorFeedPrioritiesForWorker,
  DEFAULT_DIRECTOR_FEED_PRIORITIES,
} from "./directorAttentionDb";
import type { DirectorAttentionLock } from "../director/directorMetrics";
import { getCameraDirectorySnapshot } from "./receiverManager";
import { toPublicCameraDirectory } from "./publicCameraProjection";
import {
  calculateCameraScore,
  DEFAULT_CAMERA_TILES,
  type SubjectMode,
  type CameraTelemetryInput,
} from "./directorVirtualAtlas";
import { isCanvasEligible } from "./canvasEligibility";
import {
  audioExcess,
  bitrateDerivedMotionScore,
  getEffectiveMode,
  getFollowMember,
  getOperatorMode,
  getTelemetryFor,
  hasUsableTelemetry,
  loadPersistedOperatorModeFromDb,
  recordTelemetry,
} from "./directorTelemetryStore";

// MANUAL_PILOT was missing from this union while four consumers gated on it —
// useServerDirector, DirectorObsScene, TankExperience and HomePage. Every one
// of those comparisons was statically false, so the PTZ transform never
// applied and manual pilot could not be represented at all, even though the
// lease store, the /api/tank/director/pilot route and the mode presentation
// entry were all already built. The feature was wired at both ends and
// disconnected in the middle.
import type { VirtualPtzState } from "../director/ptzState";
import { chooseFollowCamera, followDisplayName, initialFollowState, type FollowDoorway, type FollowState } from "./followMember";
import { loadEnrollment } from "./enrollmentStore";
import { getAllRoomPortals } from "./roomPortalsCatalog";
import { getActivePilotLease } from "./manualPilotStore";
import { getActiveDecoupledPolicy } from "./directorPolicyHierarchy";
import type { ActiveChaosItemPayload } from "../director/chaosDirectorCatalog";
import {
  getDirectorProgramFraming,
  persistDirectorProgramFraming,
  setDirectorProgramFraming,
  type DirectorProgramFramingLease,
} from "./directorProgramFraming";

export type ServerDirectorMode = "STANDBY" | "ATTENTION" | "AUTO_TRACKING" | "MANUAL_PILOT";
export type { ActiveChaosItemPayload };

export type ServerDirectorState = {
  activeCameraId: string;
  activeRoomKey: string;
  mode: ServerDirectorMode;
  dwellSecondsRemaining: number;
  switchedAt: number;
  reason: string;
  attentionLock: DirectorAttentionLock;
  updatedAt: number;
  /** Final programme crop. Manual pilot supplies it directly; automatic modes
   * receive the short-lived crop published by the staff compositor. */
  ptzState?: VirtualPtzState | null;
  activeChaosItem?: ActiveChaosItemPayload | null;
};

const DEFAULT_SERVER_DIRECTOR_STATE: ServerDirectorState = {
  activeCameraId: "cam-1786768240090",
  activeRoomKey: "game-room",
  mode: "AUTO_TRACKING",
  // Leaving manual pilot must drop the PTZ transform with it.
  ptzState: null,
  dwellSecondsRemaining: 15,
  switchedAt: Date.now(),
  reason: "[AUDIO_TRACKING] Live Audio Peak Auto-Delegation",
  attentionLock: DEFAULT_DIRECTOR_ATTENTION,
  updatedAt: Date.now(),
};

// Global in-memory singleton for the active server process
let g_serverDirectorState: ServerDirectorState = { ...DEFAULT_SERVER_DIRECTOR_STATE };
let g_roundRobinIndex = 0;
// Where the Follow Member target was last seen, so losing them for a few ticks
// holds their room instead of letting the programme wander.
let g_followState: FollowState | null = null;

function withLiveProgramFraming(
  state: ServerDirectorState,
  now = Date.now(),
): ServerDirectorState {
  if (state.mode === "MANUAL_PILOT") return { ...state };
  const framing = getDirectorProgramFraming(state.activeCameraId, now);
  return {
    ...state,
    ptzState: framing?.ptzState ?? null,
  };
}

/**
 * Rooms whose cameras watch the same space from different angles. Following a
 * body between these is a choice of view, not a change of room: the Kitchen
 * camera caught Tyler first on the first live walk and held while he stood
 * full-frontal to the Living Room camera.
 */
const OVERLAP_ROOM_GROUPS: string[][] = [["living-room", "kitchen"]];

/**
 * Doorways drawn in the Room Portal Studio, re-read at most once a minute: the
 * director ticks every 3 s and doorways change when someone edits a room map,
 * not per tick. A failed read keeps the last good set.
 */
let g_doorways: { at: number; list: FollowDoorway[] } = { at: 0, list: [] };
async function getFollowDoorways(now: number): Promise<FollowDoorway[]> {
  if (now - g_doorways.at < 60_000) return g_doorways.list;
  try {
    const portals = await getAllRoomPortals();
    g_doorways = {
      at: now,
      list: portals
        .filter((p) => p.enabled && p.polygon.length >= 3)
        .map((p) => ({ sourceRoomSlug: p.sourceRoomSlug, targetRoomSlug: p.targetRoomSlug, polygon: p.polygon })),
    };
  } catch {
    g_doorways = { ...g_doorways, at: now };
  }
  return g_doorways.list;
}

/**
 * What the director decided, tick by tick, for diagnostics.
 *
 * Consecutive ticks with the same camera and reason collapse into one entry
 * with a count, so a director holding a shot for ten minutes costs one line and
 * the log still reaches back past the last real decision.
 */
export type DirectorDecision = {
  firstAt: number;
  lastAt: number;
  ticks: number;
  cameraId: string;
  roomKey: string;
  mode: ServerDirectorMode;
  reason: string;
};
const DECISION_LOG_LIMIT = 150;
const g_decisionLog: DirectorDecision[] = [];

function recordDecision(state: ServerDirectorState, at: number) {
  const last = g_decisionLog[g_decisionLog.length - 1];
  if (last && last.cameraId === state.activeCameraId && last.reason === state.reason) {
    last.lastAt = at;
    last.ticks += 1;
    return;
  }
  g_decisionLog.push({
    firstAt: at,
    lastAt: at,
    ticks: 1,
    cameraId: state.activeCameraId,
    roomKey: state.activeRoomKey,
    mode: state.mode,
    reason: state.reason,
  });
  if (g_decisionLog.length > DECISION_LOG_LIMIT) g_decisionLog.shift();
}

export function getDirectorDecisionLog(): DirectorDecision[] {
  return g_decisionLog.map((d) => ({ ...d }));
}

export function getFollowDiagnostics() {
  return g_followState ? { ...g_followState } : null;
}
const DWELL_TIME_SECONDS = 15;
/** How long Follow Member holds a room with its member unseen before normal cutting resumes. */
const FOLLOW_GIVE_UP_MS = 90_000;

export type ServerDirectorWorkerHealth = {
  running: boolean;
  intervalMs: number;
  startedAt: number;
  lastTickStartedAt: number | null;
  lastTickCompletedAt: number | null;
  tickCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastModeSyncAt: number | null;
  lastModeSyncError: string | null;
  operatorMode: SubjectMode | null;
};

const g_workerHealth = {
  startedAt: Date.now(),
  lastTickStartedAt: null as number | null,
  lastTickCompletedAt: null as number | null,
  tickCount: 0,
  consecutiveFailures: 0,
  lastError: null as string | null,
  lastModeSyncAt: null as number | null,
  lastModeSyncError: null as string | null,
};

/**
 * Retrieves the current canonical server-side Director state.
 */
export async function getServerDirectorState(): Promise<ServerDirectorState> {
  const now = Date.now();

  const decoupledPolicy = getActiveDecoupledPolicy(now);
  const primaryChaosItem =
    decoupledPolicy.activeOverrides.length > 0
      ? decoupledPolicy.activeOverrides[decoupledPolicy.activeOverrides.length - 1]
      : null;
  const activeChaosPayload: ActiveChaosItemPayload | null = primaryChaosItem
    ? {
        itemSlug: primaryChaosItem.itemSlug,
        itemName: primaryChaosItem.itemName,
        triggeredBy: primaryChaosItem.triggeredBy,
        durationSeconds: primaryChaosItem.durationSeconds,
        timeRemainingSeconds: decoupledPolicy.timeRemainingSeconds,
        targetDetectionMode: decoupledPolicy.effectiveDetectionMode ?? undefined,
        targetFramingMode: decoupledPolicy.effectiveFramingMode ?? undefined,
        targetRoomKey: decoupledPolicy.effectiveRoomKey ?? undefined,
        targetCameraId: decoupledPolicy.effectiveCameraId ?? undefined,
        overrideRoomLock: decoupledPolicy.overrideRoomLock,
        chaosHopIntervalMs: decoupledPolicy.chaosHopIntervalMs ?? undefined,
      }
    : null;
  g_serverDirectorState.activeChaosItem = activeChaosPayload;

  // If state is older than 2 seconds or dwell timer elapsed, tick the server engine
  const elapsedSeconds = Math.floor((now - g_serverDirectorState.switchedAt) / 1000);
  const remaining = Math.max(0, DWELL_TIME_SECONDS - elapsedSeconds);
  g_serverDirectorState.dwellSecondsRemaining = remaining;

  if (remaining <= 0 || now - g_serverDirectorState.updatedAt > 5000) {
    await tickServerDirector();
  }

  return withLiveProgramFraming(g_serverDirectorState, now);
}

/**
 * Publish the staff compositor's final crop without taking a manual-pilot
 * lease or changing the server's selected room. OBS and public viewers receive
 * the same canonical state immediately through Realtime.
 */
export async function publishDirectorProgramFraming(input: {
  activeCameraId: string;
  activeRoomKey: string;
  ptzState: unknown;
}): Promise<DirectorProgramFramingLease> {
  const framing = setDirectorProgramFraming(
    input.activeCameraId,
    input.activeRoomKey,
    input.ptzState,
  );
  // Realtime drives smooth motion. The throttled shared snapshot makes the
  // same crop recoverable when public Tank/OBS are served by another worker.
  await Promise.all([
    broadcastDirectorFrame(framing),
    persistDirectorProgramFraming(framing),
  ]);
  return framing;
}

/**
 * Executes a single server-side evaluation tick of the Director.
 * This runs centrally on the server — never on individual client browsers.
 */
/**
 * Kick a tick without making the caller wait.
 *
 * /api/tank/cameras imports this and calls it as `void warmupServerDirector()`,
 * but it was never exported — a named import that resolves to undefined, so the
 * call threw a TypeError on the first request to that route. Restored with the
 * shape the call sites already assume: never rejects, never blocks the response
 * it is fired alongside, and RETURNS the warmed state so a caller that does
 * await it gets something useful (serverDirectorAutonomous.test.ts asserts on
 * exactly that — the first restore returned void and broke it).
 */
export async function warmupServerDirector(): Promise<ServerDirectorState> {
  try {
    return await tickServerDirector();
  } catch {
    // Warmup is best-effort: a failed tick still leaves the last good snapshot,
    // which is what every caller actually wants to serve.
    return { ...g_serverDirectorState };
  }
}

export async function tickServerDirector(): Promise<ServerDirectorState> {
  if (globalThis.__tankDirectorTickInFlight) {
    return globalThis.__tankDirectorTickInFlight;
  }

  const tick = evaluateServerDirectorTick();
  globalThis.__tankDirectorTickInFlight = tick;
  try {
    const state = await tick;
    recordDecision(state, Date.now());
    return state;
  } finally {
    if (globalThis.__tankDirectorTickInFlight === tick) {
      globalThis.__tankDirectorTickInFlight = undefined;
    }
  }
}

async function evaluateServerDirectorTick(): Promise<ServerDirectorState> {
  const now = Date.now();
  g_workerHealth.lastTickStartedAt = now;
  let tickFailed = false;

  try {
    const [attentionLock, feedPriorities, rawSnapshot] = await Promise.all([
      getDirectorAttentionForWorker().catch(() => DEFAULT_DIRECTOR_ATTENTION),
      getDirectorFeedPrioritiesForWorker().catch(() => DEFAULT_DIRECTOR_FEED_PRIORITIES),
      getCameraDirectorySnapshot().catch(() => null),
      loadPersistedOperatorModeFromDb()
        .then(() => {
          g_workerHealth.lastModeSyncAt = Date.now();
          g_workerHealth.lastModeSyncError = null;
        })
        .catch((error) => {
          // Preserve the last durable mode this process saw. A temporary DB
          // outage must not force AUTO or stop camera evaluation.
          g_workerHealth.lastModeSyncError =
            error instanceof Error ? error.message : String(error);
        }),
    ]);

    // Feed the telemetry store with a real, non-fabricated signal before
    // checking hasUsableTelemetry below — without this, that check is
    // never true (nothing else posts telemetry; the real detection
    // pipeline doesn't exist yet), so the operator's subject-mode
    // selection was silently ignored forever, every mode falling through
    // to blind round-robin regardless of what was picked. See
    // bitrateDerivedMotionScore's doc comment for exactly what this is
    // and, just as importantly, what it honestly is NOT a substitute for.
    if (rawSnapshot) {
      const bitrateTelemetry: CameraTelemetryInput[] = rawSnapshot.cameras
        .filter((c) => c.presence === "online" || c.presence === "degraded")
        .map((c) => ({
          cameraId: c.id,
          peopleCount: 0,
          visibleFeetCount: 0,
          feetConfidence: 0,
          faceCount: 0,
          motionScore: bitrateDerivedMotionScore(c.id, c.bitrateKbps),
          audioPeak: 0,
          isSpeaking: false,
        }));
      if (bitrateTelemetry.length > 0) recordTelemetry(bitrateTelemetry, null, "fallback");
    }

    const publicSnapshot = rawSnapshot ? toPublicCameraDirectory(rawSnapshot) : null;
    const cameras = publicSnapshot?.cameras ?? [];
    const rooms = publicSnapshot?.rooms ?? [];

    // Was checking c.health, a field DiscoveredCamera doesn't have (that's
    // TankCamera's field name, a different type) — c.health was always
    // undefined, so this was always empty regardless of how many cameras
    // were actually live. Confirmed live 2026-08-24 via a tracer: real
    // snapshot, 7 real cameras, onlineCameras=0 every single tick. The
    // telemetry-feed filter two lines above this in tickServerDirector
    // already uses the correct field.
    const onlineCameras = cameras.filter((c) => c.presence === "online" || c.presence === "degraded");
    const canvasCameras = onlineCameras.filter(isCanvasEligible);

    const decoupledPolicy = getActiveDecoupledPolicy(now);
    const primaryChaosItem =
      decoupledPolicy.activeOverrides.length > 0
        ? decoupledPolicy.activeOverrides[decoupledPolicy.activeOverrides.length - 1]
        : null;
    const activeChaosPayload: ActiveChaosItemPayload | null = primaryChaosItem
      ? {
          itemSlug: primaryChaosItem.itemSlug,
          itemName: primaryChaosItem.itemName,
          triggeredBy: primaryChaosItem.triggeredBy,
          durationSeconds: primaryChaosItem.durationSeconds,
          timeRemainingSeconds: decoupledPolicy.timeRemainingSeconds,
          targetDetectionMode: decoupledPolicy.effectiveDetectionMode ?? undefined,
          targetFramingMode: decoupledPolicy.effectiveFramingMode ?? undefined,
          targetRoomKey: decoupledPolicy.effectiveRoomKey ?? undefined,
          targetCameraId: decoupledPolicy.effectiveCameraId ?? undefined,
          overrideRoomLock: decoupledPolicy.overrideRoomLock,
          chaosHopIntervalMs: decoupledPolicy.chaosHopIntervalMs ?? undefined,
        }
      : null;

    g_serverDirectorState.activeChaosItem = activeChaosPayload;
    if (decoupledPolicy.hasActiveOverride && canvasCameras.length === 0) {
      g_serverDirectorState.reason =
        primaryChaosItem?.itemSlug === "chaos-cyclone"
          ? `[CHAOS_CYCLONE] Shuffled (${decoupledPolicy.timeRemainingSeconds}s remaining)`
          : `[${primaryChaosItem?.itemName.toUpperCase() || "CHAOS"}] Active item override (${decoupledPolicy.timeRemainingSeconds}s remaining)`;
    }

    // 0. Manual pilot holds precedence UNLESS a chaos item has overrideRoomLock: true
    //    (e.g. Chaos Cyclone or Viewer Mutiny explicitly knocks operator lock off its rocker)
    const pilotLease = await getActivePilotLease();
    const knockOffRocker = decoupledPolicy.hasActiveOverride && decoupledPolicy.overrideRoomLock;

    if (pilotLease && !knockOffRocker) {
      const cameraChanged = g_serverDirectorState.activeCameraId !== pilotLease.activeCameraId;
      g_serverDirectorState = {
        activeCameraId: pilotLease.activeCameraId,
        activeRoomKey: pilotLease.activeRoomKey,
        mode: "MANUAL_PILOT",
        dwellSecondsRemaining: 0,
        switchedAt:
          cameraChanged
            ? now
            : g_serverDirectorState.mode === "MANUAL_PILOT"
            ? g_serverDirectorState.switchedAt
            : now,
        reason: `[MANUAL_PILOT] ${pilotLease.pilotUser} flying via ${pilotLease.connectionType}`,
        attentionLock,
        activeChaosItem: activeChaosPayload,
        updatedAt: now,
        ptzState: pilotLease.ptzState,
      };
      // Broadcast immediately when the pilot cuts to a different camera so OBS and viewers switch without delay.
      // Continuous PTZ panning within the same camera remains a smooth shot without re-triggering cut glitches.
      if (cameraChanged) {
        await broadcastDirectorCut(g_serverDirectorState);
      }
      return g_serverDirectorState;
    }

    // 1. Attention Lock Override (Producer / Moderator emergency command)
    if (attentionLock.active) {
      let targetCamId = g_serverDirectorState.activeCameraId;
      let targetRoomKey = attentionLock.targetId;

      if (attentionLock.targetType === "room") {
        const room = rooms.find((r) => r.roomKey === attentionLock.targetId);
        if (room && room.cameraIds.length > 0) {
          targetCamId = room.cameraIds[0];
          targetRoomKey = room.roomKey;
        }
      } else if (attentionLock.targetType === "camera") {
        targetCamId = attentionLock.targetId;
        const cam = cameras.find((c) => c.id === targetCamId);
        targetRoomKey = cam?.roomScope || "director";
      }

      if (g_serverDirectorState.activeCameraId !== targetCamId || g_serverDirectorState.mode !== "ATTENTION") {
        g_serverDirectorState = {
          activeCameraId: targetCamId,
          activeRoomKey: targetRoomKey,
          mode: "ATTENTION",
          // Leaving manual pilot must drop the PTZ transform with it.
          ptzState: null,
          dwellSecondsRemaining: DWELL_TIME_SECONDS,
          switchedAt: now,
          reason: `[ATTENTION] Locked to ${attentionLock.targetLabel} by ${attentionLock.lockedBy}`,
          attentionLock,
          activeChaosItem: activeChaosPayload,
          updatedAt: now,
        };
        await broadcastDirectorCut(g_serverDirectorState);
      }
      return g_serverDirectorState;
    }

    const subjectMode: SubjectMode = getEffectiveMode();

    // 2. LEVEL 2: Active Chaos Items & Viewer Overrides
    if (decoupledPolicy.hasActiveOverride && canvasCameras.length > 0) {
      // 2a. Rapid room hop (e.g. Chaos Cyclone)
      if (decoupledPolicy.chaosHopIntervalMs) {
        const hopInterval = decoupledPolicy.chaosHopIntervalMs;
        const timeSinceSwitch = now - g_serverDirectorState.switchedAt;
        const isNewItem = g_serverDirectorState.activeChaosItem?.itemSlug !== primaryChaosItem?.itemSlug;

        if (timeSinceSwitch >= hopInterval || isNewItem || g_serverDirectorState.mode !== "AUTO_TRACKING") {
          const pool = canvasCameras.filter((c) => c.id !== g_serverDirectorState.activeCameraId);
          const hopPool = pool.length > 0 ? pool : canvasCameras;
          const nextCam = hopPool[Math.floor(Math.random() * hopPool.length)];
          const nextRoom = rooms.find((r) => r.cameraIds.includes(nextCam.id));
          const nextRoomKey = nextRoom?.roomKey || nextCam.roomScope || "game-room";

          g_serverDirectorState = {
            activeCameraId: nextCam.id,
            activeRoomKey: nextRoomKey,
            mode: "AUTO_TRACKING",
            ptzState: null,
            dwellSecondsRemaining: Math.ceil(hopInterval / 1000),
            switchedAt: now,
            reason: `[CHAOS_CYCLONE] Shuffled to ${nextCam.name} (${decoupledPolicy.timeRemainingSeconds}s remaining)`,
            attentionLock,
            activeChaosItem: activeChaosPayload,
            updatedAt: now,
          };
          await broadcastDirectorCut(g_serverDirectorState);
          return g_serverDirectorState;
        }

        // Within hop interval: maintain the shot and update dwell countdown
        g_serverDirectorState = {
          ...g_serverDirectorState,
          dwellSecondsRemaining: Math.ceil(Math.max(0, hopInterval - timeSinceSwitch) / 1000),
          activeChaosItem: activeChaosPayload,
          updatedAt: now,
        };
        return g_serverDirectorState;
      }

      // 2b. Forced Camera Override
      if (decoupledPolicy.effectiveCameraId) {
        const targetCam =
          canvasCameras.find((c) => c.id === decoupledPolicy.effectiveCameraId) ??
          onlineCameras.find((c) => c.id === decoupledPolicy.effectiveCameraId);
        if (targetCam) {
          const nextRoom = rooms.find((r) => r.cameraIds.includes(targetCam.id));
          const roomKey = nextRoom?.roomKey || targetCam.roomScope || "game-room";
          const stayingPut = targetCam.id === g_serverDirectorState.activeCameraId;

          g_serverDirectorState = {
            activeCameraId: targetCam.id,
            activeRoomKey: roomKey,
            mode: "AUTO_TRACKING",
            ptzState: null,
            dwellSecondsRemaining: decoupledPolicy.timeRemainingSeconds,
            switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
            reason: `[ITEM_CAMERA] ${primaryChaosItem?.itemName}: Locked to ${targetCam.name} (${decoupledPolicy.timeRemainingSeconds}s remaining)`,
            attentionLock,
            activeChaosItem: activeChaosPayload,
            updatedAt: now,
          };
          if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
          return g_serverDirectorState;
        }
      }

      // 2c. Forced Room Override (e.g. Room Spotlight)
      if (decoupledPolicy.effectiveRoomKey) {
        const roomCams = canvasCameras.filter(
          (c) =>
            rooms.find((r) => r.roomKey === decoupledPolicy.effectiveRoomKey)?.cameraIds.includes(c.id) ||
            c.roomScope === decoupledPolicy.effectiveRoomKey
        );
        if (roomCams.length > 0) {
          const targetCam =
            roomCams.find((c) => c.id === g_serverDirectorState.activeCameraId) ?? roomCams[0];
          const stayingPut = targetCam.id === g_serverDirectorState.activeCameraId;

          g_serverDirectorState = {
            activeCameraId: targetCam.id,
            activeRoomKey: decoupledPolicy.effectiveRoomKey,
            mode: "AUTO_TRACKING",
            ptzState: null,
            dwellSecondsRemaining: decoupledPolicy.timeRemainingSeconds,
            switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
            reason: `[ROOM_SPOTLIGHT] ${primaryChaosItem?.itemName}: Pinned to ${decoupledPolicy.effectiveRoomKey} (${decoupledPolicy.timeRemainingSeconds}s remaining)`,
            attentionLock,
            activeChaosItem: activeChaosPayload,
            updatedAt: now,
          };
          if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
          return g_serverDirectorState;
        }
      }
    }

    // 3. Operator Manual Mode: Hold the shot and cut nothing.
    // Operator selection is human authority and runs 24/7 without requiring AI vision telemetry.
    // Bypassed if a chaos item has overrideRoomLock = true (knockOffRocker).
    if (subjectMode === "manual" && onlineCameras.length > 0 && !knockOffRocker) {
      const heldCamera =
        onlineCameras.find((c) => c.id === g_serverDirectorState.activeCameraId) ??
        onlineCameras[0];
      const heldRoom =
        rooms.find((r) => r.cameraIds.includes(heldCamera.id))?.roomKey ||
        heldCamera.roomScope ||
        g_serverDirectorState.activeRoomKey;
      const alreadyHere = heldCamera.id === g_serverDirectorState.activeCameraId;

      g_serverDirectorState = {
        ...g_serverDirectorState,
        activeCameraId: heldCamera.id,
        activeRoomKey: heldRoom,
        mode: "MANUAL_PILOT",
        dwellSecondsRemaining: DWELL_TIME_SECONDS,
        switchedAt: alreadyHere ? g_serverDirectorState.switchedAt : now,
        reason: `[MANUAL] Operator control — ${heldCamera.name}`,
        attentionLock,
        activeChaosItem: activeChaosPayload,
        updatedAt: now,
      };
      // Only announce an actual change of camera; a held shot is not a cut.
      if (!alreadyHere) await broadcastDirectorCut(g_serverDirectorState);
      return g_serverDirectorState;
    }

    // 4. Operator Rotation Roster: Cycle the operator's roster on their chosen dwell.
    // Operates on the server clock 24/7 and does NOT require AI vision telemetry.
    // Bypassed if a chaos item has overrideRoomLock = true (knockOffRocker).
    if (subjectMode === "rotation" && onlineCameras.length > 0 && !knockOffRocker) {
      const roster = await loadRotationRosterFromDb();
      const order = resolveRotationOrder(
        roster,
        onlineCameras.map((c) => c.id),
      );
      const slot = pickRotationSlot({
        order,
        activeCameraId: g_serverDirectorState.activeCameraId,
        heldMs: now - g_serverDirectorState.switchedAt,
        intervalMs: roster.intervalMs,
      });

      // Null means there is nothing live to rotate at all. Leaving the
      // programme exactly as it is beats cutting to a camera that is not there.
      if (!slot) return g_serverDirectorState;

      const nextCam = onlineCameras.find((c) => c.id === slot.cameraId);
      if (!nextCam) return g_serverDirectorState;

      const nextRoomKey =
        rooms.find((r) => r.cameraIds.includes(nextCam.id))?.roomKey ||
        nextCam.roomScope ||
        g_serverDirectorState.activeRoomKey;
      const slotNumber = order.indexOf(nextCam.id) + 1;
      const rostered = roster.cameraIds.length > 0;

      g_serverDirectorState = {
        ...g_serverDirectorState,
        activeCameraId: nextCam.id,
        activeRoomKey: nextRoomKey,
        mode: "AUTO_TRACKING",
        ptzState: null,
        dwellSecondsRemaining: slot.dwellSecondsRemaining,
        switchedAt: slot.moved ? now : g_serverDirectorState.switchedAt,
        reason: `[ROTATION${rostered ? "" : ":ALL"}] ${nextCam.name} (${slotNumber}/${order.length})`,
        attentionLock,
        activeChaosItem: activeChaosPayload,
        updatedAt: now,
      };
      if (slot.moved) await broadcastDirectorCut(g_serverDirectorState);
      return g_serverDirectorState;
    }

    // 5. Detection-driven cut, when the detection layer is actually reporting.
    // If an active chaos item override specifies effectiveDetectionMode, it takes precedence.
    let effectiveDetectionMode: SubjectMode = decoupledPolicy.effectiveDetectionMode ?? subjectMode;
    // Set when Follow Member has lost its member for long enough to let normal
    // cutting resume; appended to the reason so the log still says why.
    let followNote = "";
    if (canvasCameras.length > 0 && hasUsableTelemetry(now)) {

      // 5a. Follow Member: one chosen housemate or pet, whichever room they're in.
      // Scored separately rather than through calculateCameraScore, whose
      // member case rewards ANY named person and so cannot tell who to follow.
      // Enroll is Follow Member pointed at the guest being enrolled: the
      // learner labels the one body it cannot name with the guest's slug, so
      // following that slug is following the stranger around the house.
      const enrollment = effectiveDetectionMode === "enroll" ? await loadEnrollment().catch(() => null) : null;
      if (effectiveDetectionMode === "enroll" && !enrollment) effectiveDetectionMode = "auto";
      const followSlug =
        effectiveDetectionMode === "member" ? getFollowMember()
        : effectiveDetectionMode === "enroll" ? enrollment?.slug ?? null
        : null;
      if (followSlug) {
        if (!g_followState || g_followState.slug !== followSlug) g_followState = initialFollowState(followSlug);
        const overlapGroups = OVERLAP_ROOM_GROUPS.map((group) =>
          canvasCameras
            .filter((c) => group.includes(rooms.find((r) => r.cameraIds.includes(c.id))?.roomKey ?? c.roomScope ?? ""))
            .map((c) => c.id),
        ).filter((g) => g.length > 1);
        const cameraRooms = Object.fromEntries(
          canvasCameras.map((c) => [c.id, rooms.find((r) => r.cameraIds.includes(c.id))?.roomKey ?? c.roomScope ?? ""]),
        );
        const decision = chooseFollowCamera({
          doorways: await getFollowDoorways(now),
          cameraRooms,
          state: g_followState,
          readings: canvasCameras.flatMap((cam) => {
            const telemetry = getTelemetryFor(cam.id, now);
            return telemetry ? [{ cameraId: cam.id, telemetry }] : [];
          }),
          incumbentCameraId: g_serverDirectorState.activeCameraId,
          now,
          eligibleCameraIds: canvasCameras.map((c) => c.id),
          overlapGroups,
        });
        g_followState = decision.state;

        // Holding the last room is right for a minute or two -- someone behind
        // a wall, a detector miss. Holding it for an hour is a dead room on
        // air: measured 2026-09-16, Follow Tyler sat on an empty Game Room with
        // nobody detected in any camera. Past the give-up window, normal auto
        // cutting resumes, and the next tick that names the member takes back
        // over because this branch runs first every tick.
        // Unseen means neither named nor followed as a body.
        const lastContact = Math.max(
          decision.state.lastSeen?.at ?? 0,
          decision.state.custody?.occupiedAt ?? 0,
        );
        const unseenForMs = lastContact ? now - lastContact : Infinity;
        const givenUp = decision.status === "searching" && unseenForMs > FOLLOW_GIVE_UP_MS;
        if (givenUp) {
          effectiveDetectionMode = "auto";
          followNote = ` · following ${followDisplayName(followSlug)}, ${
            lastContact ? `not seen for ${Math.round(unseenForMs / 1000)}s` : "not seen yet"
          }`;
        } else {
          const name = followDisplayName(followSlug);
          const targetId = decision.cameraId ?? g_serverDirectorState.activeCameraId;
          const cam = canvasCameras.find((c) => c.id === targetId);
          const reason = `[FOLLOW] ${name} · ${decision.status} · ${cam?.name ?? targetId} — ${decision.detail}`;
          const changed = targetId !== g_serverDirectorState.activeCameraId;
          const roomKey =
            rooms.find((r) => r.cameraIds.includes(targetId))?.roomKey ||
            cam?.roomScope ||
            g_serverDirectorState.activeRoomKey;

          g_serverDirectorState = {
            ...g_serverDirectorState,
            activeCameraId: targetId,
            activeRoomKey: roomKey,
            mode: "AUTO_TRACKING",
            ptzState: null,
            dwellSecondsRemaining: DWELL_TIME_SECONDS,
            switchedAt: changed ? now : g_serverDirectorState.switchedAt,
            reason,
            attentionLock,
            activeChaosItem: activeChaosPayload,
            updatedAt: now,
          };
          if (changed) await broadcastDirectorCut(g_serverDirectorState);
          return g_serverDirectorState;
        }
      }

      let best: { camId: string; name: string; score: number; breakdown: Record<string, number> } | null = null;
      let incumbent: { camId: string; name: string; score: number; breakdown: Record<string, number> } | null = null;

      for (const cam of canvasCameras) {
        const telemetry = getTelemetryFor(cam.id, now);
        // A camera nobody is watching for scores 0 rather than being excluded,
        // so the programme can still land there if every room is quiet.
        if (!telemetry) continue;

        const tile =
          DEFAULT_CAMERA_TILES.find((t) => t.cameraId === cam.id) ?? DEFAULT_CAMERA_TILES[0];

        // Audio-driven modes score on how loud a room is *for that room*, not
        // absolute level. A game room whose audio is always blasting otherwise
        // wins every comparison forever and the programme never cuts away —
        // which is exactly what was happening.
        const scoringTelemetry =
          effectiveDetectionMode === "speaker" || effectiveDetectionMode === "auto"
            ? { ...telemetry, audioPeak: audioExcess(cam.id, telemetry.audioPeak) }
            : telemetry;

        const scored = calculateCameraScore(tile, scoringTelemetry, effectiveDetectionMode, feedPriorities);
        const entry = { camId: cam.id, name: cam.name, score: scored.score, breakdown: scored.breakdown };

        if (cam.id === g_serverDirectorState.activeCameraId) incumbent = entry;
        if (!best || scored.score > best.score) best = entry;
      }

      // The incumbent not having FRESH telemetry this exact tick (its own
      // reading just outside the 4s TTL, or momentarily missing) must not
      // silently waive the margin check below — the loop above only records
      // `incumbent` when it has a live reading, via `continue`, so a single
      // stale sample let ANY positive-scoring challenger through uncontested.
      // Treat "camera still on the canvas but no fresh reading" as score 0,
      // never as "no incumbent to protect".
      if (!incumbent) {
        const stillOnCanvas = canvasCameras.find((c) => c.id === g_serverDirectorState.activeCameraId);
        if (stillOnCanvas) {
          incumbent = { camId: stillOnCanvas.id, name: stillOnCanvas.name, score: 0, breakdown: {} };
        }
      }

      // A challenger must beat the incumbent by a real margin, not just any
      // positive amount. bitrate-derived motion (the only signal live right
      // now) sits in single digits even during genuine room activity.
      const SWITCH_MARGIN = 8;
      if (
        best &&
        incumbent &&
        best.camId !== incumbent.camId &&
        best.score - incumbent.score < SWITCH_MARGIN
      ) {
        best = incumbent;
      }

      if (best) {
        const nextRoom = rooms.find((r) => r.cameraIds.includes(best!.camId));
        const cam = canvasCameras.find((c) => c.id === best!.camId);
        const roomKey = nextRoom?.roomKey || cam?.roomScope || "game-room";

        // Hold the current shot unless something genuinely beats it
        const stayingPut = best.camId === g_serverDirectorState.activeCameraId;

        g_serverDirectorState = {
          activeCameraId: best.camId,
          activeRoomKey: roomKey,
          mode: "AUTO_TRACKING",
          // Leaving manual pilot must drop the PTZ transform with it.
          ptzState: null,
          dwellSecondsRemaining: DWELL_TIME_SECONDS,
          switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
          reason:
            `[${effectiveDetectionMode.toUpperCase()}] ${best.name} scored ${best.score} · ` +
            Object.entries(best.breakdown)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}:${v}`)
              .join(" ") + followNote,
          attentionLock,
          activeChaosItem: activeChaosPayload,
          updatedAt: now,
        };

        if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
        return g_serverDirectorState;
      }
    }

    // 6. Standby / Round-Robin Server Cycle.
    //
    // User OBS rooms and IRL feeds are Director sources by default, just like
    // fixed house cameras. The reserved admin `obs/director` dummy/program
    // input is not part of this camera directory, so it cannot be selected
    // here. Room Control and public visibility have already removed disabled
    // rooms through toPublicCameraDirectory().
    if (onlineCameras.length > 0) {
      const irlPriorityCam = (feedPriorities.irlPriority ?? true)
        ? onlineCameras.find(
            (camera) =>
              camera.slug.includes("irl") ||
              camera.id.includes("irl") ||
              camera.protocol === "srt" ||
              camera.protocol === "srtla",
          )
        : null;
      const obsPriorityCam = (feedPriorities.obsPriority ?? true)
        ? onlineCameras.find(
            (camera) =>
              camera.slug.includes("obs") ||
              camera.id.includes("obs") ||
              camera.protocol === "rtmp",
          )
        : null;

      const priorityCam = irlPriorityCam ?? obsPriorityCam;
      let nextCam = priorityCam;

      if (!nextCam) {
        g_roundRobinIndex = (g_roundRobinIndex + 1) % onlineCameras.length;
        nextCam = onlineCameras[g_roundRobinIndex];
      }

      const nextRoom = rooms.find((r) => r.cameraIds.includes(nextCam.id));
      const roomKey = nextRoom?.roomKey || nextCam.roomScope || "game-room";

      const stayingPut = nextCam.id === g_serverDirectorState.activeCameraId;

      g_serverDirectorState = {
        activeCameraId: nextCam.id,
        activeRoomKey: roomKey,
        mode: "STANDBY",
        // Leaving manual pilot must drop the PTZ transform with it.
        ptzState: null,
        dwellSecondsRemaining: DWELL_TIME_SECONDS,
        switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
        reason: priorityCam
          ? `[PRIORITY] Auto-Prioritized Feed: ${nextCam.name}`
          : `[STANDBY] Server rotation: ${nextCam.name}`,
        attentionLock,
        activeChaosItem: activeChaosPayload,
        updatedAt: now,
      };

      if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
    }
  } catch (err) {
    tickFailed = true;
    g_workerHealth.lastError = err instanceof Error ? err.message : String(err);
    console.error("[ServerDirectorEngine] Error during server director tick:", err);
  } finally {
    g_workerHealth.lastTickCompletedAt = Date.now();
    g_workerHealth.tickCount += 1;
    g_workerHealth.consecutiveFailures = tickFailed
      ? g_workerHealth.consecutiveFailures + 1
      : 0;
    if (!tickFailed) g_workerHealth.lastError = null;
  }

  return g_serverDirectorState;
}

// Keep the programme cutting on its own clock instead of piggybacking on
// page-load traffic. getServerDirectorState() was the ONLY thing that ever
// called tickServerDirector, and it only runs from Page.tsx's SSR — so a
// viewer who just leaves the tab open (the normal case for a livestream)
// never triggers another tick, and the whole engine sits frozen on whatever
// it computed for whoever loaded the page last. Confirmed live 2026-08-24:
// tank_platform_settings never once contained a server_director_state row —
// broadcastDirectorCut had never fired since this container started.
// unt_tank runs `bun server.js` as one long-lived process (not serverless),
// so a module-level interval is safe: it survives for the container's
// lifetime and is the same in-memory-singleton model g_serverDirectorState
// itself already relies on. Guarded on globalThis so Next.js dev-mode HMR
// re-evaluating this module on save doesn't stack up duplicate timers.
const DIRECTOR_TICK_INTERVAL_MS = 3000;
declare global {
  // eslint-disable-next-line no-var
  var __tankDirectorTickTimer: ReturnType<typeof setInterval> | undefined;
  // eslint-disable-next-line no-var
  var __tankDirectorTickInFlight: Promise<ServerDirectorState> | undefined;
}
/**
 * Whether this process should run the live director.
 *
 * Only the production Tank process directs. A dev container (unaxis zone tank
 * dev start) sets NEXT_PUBLIC_ZONE=tank too, and before this check it ran a
 * SECOND director against the same database, persisting and broadcasting its
 * own cuts over the live programme. TANK_DIRECTOR_TICK=1 opts any other
 * process in deliberately.
 */
export function shouldDirectProgramme(env: Record<string, string | undefined> = process.env): boolean {
  const isTankZone =
    env.NEXT_PUBLIC_ZONE === "tank" ||
    env.ZONE === "tank" ||
    (!env.NEXT_PUBLIC_ZONE && env.NODE_ENV !== "production");
  const directs = env.NODE_ENV === "production" || env.TANK_DIRECTOR_TICK === "1";
  return isTankZone && directs && env.NEXT_PHASE !== "phase-production-build";
}

/** Start the process-owned tick. Idempotent, so HMR re-evaluation never stacks timers. */
export function startDirectorTicking(): void {
  if (globalThis.__tankDirectorTickTimer) return;
  globalThis.__tankDirectorTickTimer = setInterval(() => {
    getServerDirectorState().catch((err) => {
      console.error("[ServerDirectorEngine] background tick failed:", err);
    });
  }, DIRECTOR_TICK_INTERVAL_MS);
}

if (shouldDirectProgramme()) startDirectorTicking();

export function getServerDirectorWorkerHealth(): ServerDirectorWorkerHealth {
  return {
    running: Boolean(globalThis.__tankDirectorTickTimer),
    intervalMs: DIRECTOR_TICK_INTERVAL_MS,
    ...g_workerHealth,
    operatorMode: getOperatorMode(),
  };
}



// ── Realtime broadcast helpers ────────────────────────────────────────────────
//
// Server-side broadcasting must use a SUBSCRIBED channel. The old pattern of
// creating a throwaway channel + channel.send() + removeChannel() per call
// caused two failures:
//
//   1. broadcastDirectorFrame called removeChannel() immediately, racing the
//      ACK and causing the WebSocket to close before the send completed —
//      every PTZ framing event silently dropped.
//
//   2. The Realtime REST /api/broadcast endpoint returns 404 on this
//      self-hosted Realtime v2.25.50 instance when called via Kong, because
//      the Kong route does not proxy that path.
//
// Fix: a single module-level channel that is subscribed once and reused for all
// sends. Supabase-js will reconnect it automatically if the WebSocket drops.

import type { RealtimeChannel } from "@supabase/supabase-js";

let g_broadcastChannel: RealtimeChannel | null = null;
let g_broadcastChannelReady = false;

function getOrCreateBroadcastChannel(): RealtimeChannel {
  if (g_broadcastChannel && g_broadcastChannelReady) return g_broadcastChannel;

  const admin = createAdminClient();
  const ch = admin.channel("tank:director:state", {
    config: { broadcast: { ack: false, self: false } },
  });

  ch.subscribe((status) => {
    g_broadcastChannelReady = status === "SUBSCRIBED";
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      // Let it be recreated on next send.
      g_broadcastChannel = null;
      g_broadcastChannelReady = false;
    }
  });

  g_broadcastChannel = ch;
  return ch;
}

async function realtimeBroadcast(
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    const ch = getOrCreateBroadcastChannel();
    const result = await ch.send({ type: "broadcast", event, payload });
    if (result !== "ok" && result !== "rate limited") {
      console.error(`[ServerDirectorEngine] broadcast "${event}" result:`, result);
    }
  } catch (err) {
    console.error("[ServerDirectorEngine] realtimeBroadcast threw:", err);
  }
}

/**
 * Broadcasts the canonical Director cut to all connected clients via Supabase Realtime.
 */
async function broadcastDirectorCut(state: ServerDirectorState) {
  try {
    const visibleState = withLiveProgramFraming(state);
    const admin = createAdminClient();
    // Persist to platform settings so reconnecting clients get the latest state.
    const { error: upsertError } = await admin.from("tank_platform_settings").upsert(
      {
        key: "server_director_state",
        value: visibleState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (upsertError) {
      console.error("[ServerDirectorEngine] platform_settings upsert failed:", upsertError);
    }
    await realtimeBroadcast("director_cut", visibleState);
  } catch (err) {
    console.error("[ServerDirectorEngine] broadcastDirectorCut threw:", err);
  }
}

/** Framing moves are frequent and ephemeral — broadcast only, never written to
 *  the DB on every animation frame. The throttled persist in
 *  persistDirectorProgramFraming covers the cross-worker durable path. */
async function broadcastDirectorFrame(framing: DirectorProgramFramingLease) {
  await realtimeBroadcast("director_frame", {
    cameraId: framing.cameraId,
    ptzState: framing.ptzState,
  });
}
