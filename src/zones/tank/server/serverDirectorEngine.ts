import { createAdminClient } from "@/utils/supabase/admin";
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
  getTelemetryFor,
  hasUsableTelemetry,
  recordTelemetry,
} from "./directorTelemetryStore";

export type ServerDirectorMode = "STANDBY" | "ATTENTION" | "AUTO_TRACKING";

export type ServerDirectorState = {
  activeCameraId: string;
  activeRoomKey: string;
  mode: ServerDirectorMode;
  dwellSecondsRemaining: number;
  switchedAt: number;
  reason: string;
  attentionLock: DirectorAttentionLock;
  updatedAt: number;
};

const DEFAULT_SERVER_DIRECTOR_STATE: ServerDirectorState = {
  activeCameraId: "cam-1786768240090",
  activeRoomKey: "game-room",
  mode: "AUTO_TRACKING",
  dwellSecondsRemaining: 15,
  switchedAt: Date.now(),
  reason: "[AUDIO_TRACKING] Live Audio Peak Auto-Delegation",
  attentionLock: DEFAULT_DIRECTOR_ATTENTION,
  updatedAt: Date.now(),
};

// Global in-memory singleton for the active server process
let g_serverDirectorState: ServerDirectorState = { ...DEFAULT_SERVER_DIRECTOR_STATE };
let g_roundRobinIndex = 0;
const DWELL_TIME_SECONDS = 15;

/**
 * Retrieves the current canonical server-side Director state.
 */
export async function getServerDirectorState(): Promise<ServerDirectorState> {
  const now = Date.now();

  // If state is older than 2 seconds or dwell timer elapsed, tick the server engine
  const elapsedSeconds = Math.floor((now - g_serverDirectorState.switchedAt) / 1000);
  const remaining = Math.max(0, DWELL_TIME_SECONDS - elapsedSeconds);
  g_serverDirectorState.dwellSecondsRemaining = remaining;

  if (remaining <= 0 || now - g_serverDirectorState.updatedAt > 5000) {
    await tickServerDirector();
  }

  return { ...g_serverDirectorState };
}

/**
 * Executes a single server-side evaluation tick of the Director.
 * This runs centrally on the server — never on individual client browsers.
 */
export async function tickServerDirector(): Promise<ServerDirectorState> {
  const now = Date.now();

  try {
    const [attentionLock, feedPriorities, rawSnapshot] = await Promise.all([
      getDirectorAttentionForWorker().catch(() => DEFAULT_DIRECTOR_ATTENTION),
      getDirectorFeedPrioritiesForWorker().catch(() => DEFAULT_DIRECTOR_FEED_PRIORITIES),
      getCameraDirectorySnapshot().catch(() => null),
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
      if (bitrateTelemetry.length > 0) recordTelemetry(bitrateTelemetry);
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

    // 1. Attention Lock Override (Producer / Moderator command)
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
        targetRoomKey = cam?.roomKey || "director";
      }

      if (g_serverDirectorState.activeCameraId !== targetCamId || g_serverDirectorState.mode !== "ATTENTION") {
        g_serverDirectorState = {
          activeCameraId: targetCamId,
          activeRoomKey: targetRoomKey,
          mode: "ATTENTION",
          dwellSecondsRemaining: DWELL_TIME_SECONDS,
          switchedAt: now,
          reason: `[ATTENTION] Locked to ${attentionLock.targetLabel} by ${attentionLock.lockedBy}`,
          attentionLock,
          updatedAt: now,
        };
        await broadcastDirectorCut(g_serverDirectorState);
      }
      return g_serverDirectorState;
    }

    // 2. Detection-driven cut, when the detection layer is actually reporting.
    //
    // The subject-mode scoring in directorVirtualAtlas — feet, speaker, crowd,
    // chaos — existed for a long time but nothing ever called it in
    // production: this engine cut round-robin and the scorer only ran in the
    // configuration screen against fabricated numbers. This is the join.
    //
    // Gated on telemetry actually being fresh AND covering more than one
    // camera. Scoring picks a winner among rooms, so a single reporting camera
    // would always win and pin the programme to whichever room happens to have
    // a detector attached.
    // Detection only ever runs over cameras that hold their tile when they
    // drop. Everything else removes its room from the canvas entirely, so a
    // detection-driven cut could land on a room that vanishes a second later —
    // and scoring rooms against each other is meaningless if the set of rooms
    // changes underneath it. See canvasEligibility.ts.
    const canvasCameras = onlineCameras.filter(isCanvasEligible);

    if (canvasCameras.length > 0 && hasUsableTelemetry(now)) {
      // Operator selection wins over the detector's suggestion. Picking
      // "group" must actually give group.
      const subjectMode: SubjectMode = getEffectiveMode();

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
          subjectMode === "speaker" || subjectMode === "auto"
            ? { ...telemetry, audioPeak: audioExcess(cam.id, telemetry.audioPeak) }
            : telemetry;

        const scored = calculateCameraScore(tile, scoringTelemetry, subjectMode, feedPriorities);
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
        const roomKey = nextRoom?.roomKey || cam?.roomKey || "game-room";

        // Hold the current shot unless something genuinely beats it
        const stayingPut = best.camId === g_serverDirectorState.activeCameraId;

        g_serverDirectorState = {
          activeCameraId: best.camId,
          activeRoomKey: roomKey,
          mode: "AUTO_TRACKING",
          dwellSecondsRemaining: DWELL_TIME_SECONDS,
          switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
          reason:
            `[${subjectMode.toUpperCase()}] ${best.name} scored ${best.score} · ` +
            Object.entries(best.breakdown)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `${k}:${v}`)
              .join(" "),
          attentionLock,
          updatedAt: now,
        };

        if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
        return g_serverDirectorState;
      }
    }

    // 3. Standby / Round-Robin Server Cycle.
    //
    // If IRL or OBS priority is toggled ON and one of those feeds is live,
    // prioritize it immediately in standby rather than cycling past it.
    if (onlineCameras.length > 0) {
      const irlPriorityCam = (feedPriorities.irlPriority ?? true)
        ? onlineCameras.find((c) => c.slug.includes("irl") || c.id.includes("irl") || (c as any).kind === "irlcam")
        : null;
      const obsPriorityCam = (feedPriorities.obsPriority ?? true)
        ? onlineCameras.find((c) => c.slug.includes("obs") || c.id.includes("obs") || (c as any).kind === "obs")
        : null;

      const priorityCam = irlPriorityCam ?? obsPriorityCam;
      let nextCam = priorityCam;

      if (!nextCam) {
        g_roundRobinIndex = (g_roundRobinIndex + 1) % onlineCameras.length;
        nextCam = onlineCameras[g_roundRobinIndex];
      }

      const nextRoom = rooms.find((r) => r.cameraIds.includes(nextCam.id));
      const roomKey = nextRoom?.roomKey || nextCam.roomKey || "game-room";

      const stayingPut = nextCam.id === g_serverDirectorState.activeCameraId;

      g_serverDirectorState = {
        activeCameraId: nextCam.id,
        activeRoomKey: roomKey,
        mode: "STANDBY",
        dwellSecondsRemaining: DWELL_TIME_SECONDS,
        switchedAt: stayingPut ? g_serverDirectorState.switchedAt : now,
        reason: priorityCam
          ? `[PRIORITY] Auto-Prioritized Feed: ${nextCam.name}`
          : `[STANDBY] Server rotation: ${nextCam.name}`,
        attentionLock,
        updatedAt: now,
      };

      if (!stayingPut) await broadcastDirectorCut(g_serverDirectorState);
    }
  } catch (err) {
    console.error("[ServerDirectorEngine] Error during server director tick:", err);
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
}
if (process.env.NEXT_PHASE !== "phase-production-build" && !globalThis.__tankDirectorTickTimer) {
  globalThis.__tankDirectorTickTimer = setInterval(() => {
    getServerDirectorState().catch((err) => {
      console.error("[ServerDirectorEngine] background tick failed:", err);
    });
  }, DIRECTOR_TICK_INTERVAL_MS);
}

/**
 * Broadcasts the canonical Director cut to all connected clients via Supabase Realtime.
 */
async function broadcastDirectorCut(state: ServerDirectorState) {
  try {
    const admin = createAdminClient();
    // Persist to platform settings
    const { error: upsertError } = await admin.from("tank_platform_settings").upsert(
      {
        key: "server_director_state",
        value: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (upsertError) {
      console.error("[ServerDirectorEngine] platform_settings upsert failed:", upsertError);
    }

    // Broadcast across realtime channel
    const channel = admin.channel("tank:director:state");
    const sendResult = await channel.send({
      type: "broadcast",
      event: "director_cut",
      payload: state,
    });
    if (sendResult !== "ok") {
      console.error("[ServerDirectorEngine] realtime broadcast did not confirm:", sendResult);
    }
  } catch (err) {
    // Was previously fully silent — this is the only path that tells
    // anyone a cut computed correctly in-memory never reached a viewer.
    console.error("[ServerDirectorEngine] broadcastDirectorCut threw:", err);
  }
}
