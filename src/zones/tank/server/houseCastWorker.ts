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
import { cameraRoomMap, computeHouseCast, houseCastChanged, type HouseCastState } from "../vision/houseCast";
import { ROOM_SCENE_BUCKET, ROOM_SCENE_FOLDER } from "../public/roomScenes";
import { getFreshTelemetry } from "./directorTelemetryStore";
import { getCameraDirectorySnapshot } from "./receiverManager";

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
  const [snapshot, fits] = await Promise.all([getCameraDirectorySnapshot().catch(() => null), loadCameraFits(now)]);
  const prev = globalThis.__tankHouseCast;
  const previous = prev?.state.members ?? [];
  const cameraRooms = snapshot
    ? cameraRoomMap([...snapshot.rooms, ...(snapshot.offAirRooms ?? [])], snapshot.cameras)
    : new Map<string, string>();
  const members = computeHouseCast({ readings: getFreshTelemetry(now), cameraRooms, fits, previous, now });
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
