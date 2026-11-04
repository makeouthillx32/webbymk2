// src/zones/tank/server/houseCastWorker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Once a second: fresh detection boxes -> the house cast (vision/houseCast.ts),
// kept on globalThis and broadcast as `house_cast` on tank:director:state so
// the alt director's sprites follow the real people around the house.
//
// Runs only where the director runs (serverDirectorEngine starts it), so there
// is exactly one cast per house. Camera fits come from the published
// rooms3d/camera-fits.json (scripts/tank-rooms-sync.ts fits).
//
// Mirrors EVERY room, including rooms off air for Tank: the cast is a sprite
// and a floor position, never footage, and the house chose to show it publicly
// (2026-11-04). It reads the RAW camera directory for that reason.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCameraFits, type RoomCameraFit } from "../vision/fisheyeFloor";
import {
  cameraRoomMap,
  computeHouseCast,
  houseCastChanged,
  parseLastSeen,
  rememberLastSeen,
  type HouseCastState,
  type LastSeen,
} from "../vision/houseCast";
import { ROOM_SCENE_BUCKET, ROOM_SCENE_FOLDER } from "../public/roomScenes";
import { getFreshTelemetry } from "./directorTelemetryStore";
import { getCameraDirectorySnapshot } from "./receiverManager";
import { loadUntrackedCast } from "./houseCastPrefs";

export const HOUSE_CAST_INTERVAL_MS = 1000;
/** Re-send an unchanged cast this often, so a late subscriber catches up without polling. */
const HEARTBEAT_MS = 10_000;
const FITS_TTL_MS = 5 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __tankHouseCast: { state: HouseCastState; broadcastAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __tankCameraFits: { fits: Record<string, RoomCameraFit>; at: number } | undefined;
  // eslint-disable-next-line no-var
  var __tankHouseCastTimer: ReturnType<typeof setInterval> | undefined;
  // eslint-disable-next-line no-var
  var __tankHouseCastDebug: HouseCastDebug | undefined;
  // eslint-disable-next-line no-var
  var __tankHouseCastLastSeen: { cache: Record<string, LastSeen>; loaded: boolean; savedAt: number; dirty: boolean } | undefined;
}

// Where each member was last seen, kept after they leave the cameras and
// across restarts (tank_platform_settings), so the tracker can predict who a
// returning animal is. Server-side only: never broadcast.
const LAST_SEEN_KEY = "house_cast_last_seen";
const LAST_SEEN_SAVE_MS = 30_000;

function lastSeenStore() {
  return (globalThis.__tankHouseCastLastSeen ??= { cache: {}, loaded: false, savedAt: 0, dirty: false });
}

export function getLastSeen(): Record<string, LastSeen> {
  return lastSeenStore().cache;
}

async function loadLastSeenOnce() {
  const store = lastSeenStore();
  if (store.loaded) return;
  store.loaded = true;
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const { data } = await createAdminClient().from("tank_platform_settings").select("value").eq("key", LAST_SEEN_KEY).maybeSingle();
    store.cache = { ...parseLastSeen(data?.value), ...store.cache };
  } catch {
    // Start empty; the cache refills from live sightings.
  }
}

async function saveLastSeen(now: number) {
  const store = lastSeenStore();
  if (!store.dirty || now - store.savedAt < LAST_SEEN_SAVE_MS) return;
  store.savedAt = now;
  store.dirty = false;
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    await createAdminClient()
      .from("tank_platform_settings")
      .upsert({ key: LAST_SEEN_KEY, value: store.cache, updated_at: new Date(now).toISOString() }, { onConflict: "key" });
  } catch {
    store.dirty = true;
  }
}

/** What the last tick had to work with, for staff diagnostics. */
export type HouseCastDebug = {
  at: number;
  readings: number;
  mappedCameras: number;
  fitRooms: string[];
  boxes: Array<{ cameraId: string; room: string | null; label: string; name: string | null; confidence: number | null; fitted: boolean }>;
  members: number;
};

export function getHouseCastDebug(): HouseCastDebug | null {
  return globalThis.__tankHouseCastDebug ?? null;
}

export function getHouseCast(): HouseCastState {
  return globalThis.__tankHouseCast?.state ?? { updatedAt: 0, members: [] };
}

export async function loadCameraFits(now = Date.now()): Promise<Record<string, RoomCameraFit>> {
  const cached = globalThis.__tankCameraFits;
  if (cached && now - cached.at < FITS_TTL_MS) return cached.fits;
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const { data, error } = await createAdminClient()
      .storage.from(ROOM_SCENE_BUCKET)
      .download(`${ROOM_SCENE_FOLDER}/camera-fits.json`);
    if (error || !data) throw error ?? new Error("camera-fits.json missing");
    const fits = parseCameraFits(JSON.parse(await data.text()));
    globalThis.__tankCameraFits = { fits, at: now };
    return fits;
  } catch {
    // Keep the last good fits (or none) and retry after the TTL.
    const fits = cached?.fits ?? {};
    globalThis.__tankCameraFits = { fits, at: now };
    return fits;
  }
}

/**
 * One cast tick. Returns the new state and whether it should go out on the
 * wire; `send` does the broadcast (the director's subscribed channel).
 */
export async function tickHouseCast(
  send: (state: HouseCastState) => Promise<void>,
  now = Date.now(),
): Promise<HouseCastState> {
  const [snapshot, fits, untracked] = await Promise.all([
    getCameraDirectorySnapshot().catch(() => null),
    loadCameraFits(now),
    loadUntrackedCast(now),
    loadLastSeenOnce(),
  ]);
  const seenStore = lastSeenStore();
  const prev = globalThis.__tankHouseCast;
  const previous = prev?.state.members ?? [];
  const cameraRooms = snapshot
    ? cameraRoomMap([...snapshot.rooms, ...(snapshot.offAirRooms ?? [])], snapshot.cameras)
    : new Map<string, string>();
  const readings = getFreshTelemetry(now);
  const members = computeHouseCast({ readings, cameraRooms, fits, previous, now, untracked, lastSeen: seenStore.cache });
  const remembered = rememberLastSeen(seenStore.cache, members, untracked);
  if (members.length || Object.keys(remembered).length !== Object.keys(seenStore.cache).length) seenStore.dirty = true;
  seenStore.cache = remembered;
  void saveLastSeen(now);
  globalThis.__tankHouseCastDebug = {
    at: now,
    readings: readings.length,
    mappedCameras: cameraRooms.size,
    fitRooms: Object.keys(fits).sort(),
    boxes: readings.flatMap((r) =>
      (r.boundingBoxes ?? []).slice(0, 8).map((b) => {
        const room = cameraRooms.get(r.cameraId) ?? null;
        return { cameraId: r.cameraId, room, label: b.label, name: b.targetName ?? null, confidence: b.confidence ?? null, fitted: Boolean(room && fits[room]) };
      }),
    ),
    members: members.length,
  };
  const state: HouseCastState = { updatedAt: now, members };
  const due = !prev || houseCastChanged(previous, members) || now - prev.broadcastAt >= HEARTBEAT_MS;
  globalThis.__tankHouseCast = { state, broadcastAt: due ? now : prev!.broadcastAt };
  if (due) await send(state);
  return state;
}

/** Idempotent, like the director's own tick. */
export function startHouseCastTicking(send: (state: HouseCastState) => Promise<void>): void {
  if (globalThis.__tankHouseCastTimer) return;
  let inFlight = false;
  globalThis.__tankHouseCastTimer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    tickHouseCast(send)
      .catch((err) => console.error("[houseCast] tick failed:", err))
      .finally(() => {
        inFlight = false;
      });
  }, HOUSE_CAST_INTERVAL_MS);
}
