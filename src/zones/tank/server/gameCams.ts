// Game cams: the director's cameras for GAME mode.
//
// Every room exported from the house .blend carries one "TANK — <room>"
// camera placed where the real camera hangs (rooms3d/<room>.glb, and the same
// six inside house.glb), keyed by the room key. While nothing is on air the
// server director cuts between these the way it cuts between real feeds:
// one pick for everyone, broadcast as a director_cut, so every viewer and the
// staff console see the same game cam at the same time.
//
// Game cams never look at a real feed or at tracking, so they can't leak
// anything about rooms that are off air.

import { parseRoomSceneManifest, ROOM_SCENE_BUCKET, ROOM_SCENE_FOLDER } from "../public/roomScenes";

/** How long the tour holds each game cam. */
export const GAME_CAM_DWELL_SECONDS = 12;
/** How long a staff "take" holds a game cam before the tour resumes. */
export const GAME_CAM_TAKE_SECONDS = 120;

export type GameCamHold = { roomKey: string; until: number; by: string };

export type GameCamPick = {
  roomKey: string | null;
  dwellSecondsRemaining: number;
  reason: string;
};

const label = (roomKey: string) =>
  roomKey
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

/** The game cams a manifest offers: every room with a published scene, in tour order. */
export function gameCamKeysFromManifest(raw: unknown): string[] {
  return Object.keys(parseRoomSceneManifest(raw).rooms).sort();
}

/**
 * Which game cam is on. A live staff hold wins; otherwise the current cam
 * keeps the shot until its dwell runs out, then the tour moves to the next
 * room. A cam that disappeared from the manifest is dropped at once.
 */
export function pickGameCam(input: {
  keys: readonly string[];
  current: string | null;
  switchedAt: number;
  now: number;
  dwellSeconds?: number;
  hold?: GameCamHold | null;
}): GameCamPick {
  const { keys, current, switchedAt, now, hold } = input;
  const dwellMs = (input.dwellSeconds ?? GAME_CAM_DWELL_SECONDS) * 1000;
  if (keys.length === 0) {
    return { roomKey: null, dwellSecondsRemaining: 0, reason: "[GAME] No room is on air and no game cams are published" };
  }
  if (hold && hold.until > now && keys.includes(hold.roomKey)) {
    return {
      roomKey: hold.roomKey,
      dwellSecondsRemaining: Math.ceil((hold.until - now) / 1000),
      reason: `[GAME] ${hold.by} took the ${label(hold.roomKey)} game cam`,
    };
  }
  const index = current ? keys.indexOf(current) : -1;
  if (index >= 0 && now - switchedAt < dwellMs) {
    return {
      roomKey: current,
      dwellSecondsRemaining: Math.ceil((dwellMs - (now - switchedAt)) / 1000),
      reason: `[GAME] Touring the house: ${label(current as string)} game cam`,
    };
  }
  const next = keys[(index + 1) % keys.length];
  return {
    roomKey: next,
    dwellSecondsRemaining: Math.ceil(dwellMs / 1000),
    reason: `[GAME] Touring the house: ${label(next)} game cam`,
  };
}

// ── Staff hold ───────────────────────────────────────────────────────────────
// One process directs the programme (shouldDirectProgramme), and the staff
// route runs in it, so the hold lives in memory. globalThis, not a module
// variable, so a route chunk and the director worker can't each hold a copy.

declare global {
  // eslint-disable-next-line no-var
  var __tankGameCamHold: GameCamHold | null | undefined;
  // eslint-disable-next-line no-var
  var __tankGameCamKeys: { keys: string[]; at: number } | undefined;
}

export function getGameCamHold(now = Date.now()): GameCamHold | null {
  const hold = globalThis.__tankGameCamHold ?? null;
  return hold && hold.until > now ? hold : null;
}

export function setGameCamHold(roomKey: string, by: string, now = Date.now()): GameCamHold {
  const hold = { roomKey, by, until: now + GAME_CAM_TAKE_SECONDS * 1000 };
  globalThis.__tankGameCamHold = hold;
  return hold;
}

export function clearGameCamHold(): void {
  globalThis.__tankGameCamHold = null;
}

// ── Manifest ─────────────────────────────────────────────────────────────────

const KEYS_TTL_MS = 60_000;

/**
 * The published game cams, re-read at most once a minute. A failed read
 * keeps the last good list, so a storage hiccup never blanks the tour.
 */
export async function loadGameCamKeys(now = Date.now()): Promise<string[]> {
  const cached = globalThis.__tankGameCamKeys;
  if (cached && now - cached.at < KEYS_TTL_MS) return cached.keys;
  try {
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const { data, error } = await createAdminClient()
      .storage.from(ROOM_SCENE_BUCKET)
      .download(`${ROOM_SCENE_FOLDER}/rooms.json`);
    if (error || !data) throw error ?? new Error("rooms.json missing");
    const keys = gameCamKeysFromManifest(JSON.parse(await data.text()));
    globalThis.__tankGameCamKeys = { keys, at: now };
    return keys;
  } catch {
    if (cached) {
      globalThis.__tankGameCamKeys = { keys: cached.keys, at: now };
      return cached.keys;
    }
    return [];
  }
}
