// 3D stand-ins for rooms that are off air.
//
// Each room's scene is a GLB exported from the house model in Blender (one
// fixed file name per room, replaced in place on every re-export) and synced
// to the public `tank-assets` bucket under rooms3d/ by
// scripts/tank-rooms-sync.ts. The bucket's rooms.json is the switch: a room
// listed there gets its 3D scene when its feed is dark; a room that isn't
// keeps the plain off-air card.

export const ROOM_SCENE_BUCKET = "tank-assets";
export const ROOM_SCENE_FOLDER = "rooms3d";

export type RoomSceneEntry = { file: string; version: string };
export type RoomSceneManifest = { rooms: Record<string, RoomSceneEntry> };

const ROOM_KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^[a-f0-9]{6,40}$/;

function storageBase(): string {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://db.unenter.live";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${ROOM_SCENE_BUCKET}/${ROOM_SCENE_FOLDER}`;
}

export function roomSceneManifestUrl(): string {
  return `${storageBase()}/rooms.json`;
}

/** Where three's DRACOLoader finds its decoder (synced next to the scenes). */
export function roomSceneDecoderPath(): string {
  return `${storageBase()}/draco/`;
}

/**
 * Accept only what the viewer needs, in the shape we expect. Anything odd is
 * dropped rather than trusted: the file name must be the room's own fixed name
 * so a manifest can never point the page at another path.
 */
export function parseRoomSceneManifest(raw: unknown): RoomSceneManifest {
  const rooms: Record<string, RoomSceneEntry> = {};
  const source = raw && typeof raw === "object" ? (raw as { rooms?: unknown }).rooms : null;
  if (!source || typeof source !== "object") return { rooms };
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (!ROOM_KEY.test(key) || !value || typeof value !== "object") continue;
    const { file, version } = value as { file?: unknown; version?: unknown };
    if (file !== `${key}.glb` || typeof version !== "string" || !VERSION.test(version)) continue;
    rooms[key] = { file, version };
  }
  return { rooms };
}

/** Versioned URL for a room's scene, or null when that room has none. */
export function roomSceneUrl(manifest: RoomSceneManifest | null, roomKey: string | null | undefined): string | null {
  if (!manifest || !roomKey) return null;
  const entry = manifest.rooms[roomKey];
  if (!entry) return null;
  return `${storageBase()}/${entry.file}?v=${entry.version}`;
}

/**
 * The 3D room replaces only a dark single-room view. Director and the grid
 * keep their own empty states, and a live feed always wins.
 */
export function shouldShowRoomScene(input: {
  mode: string;
  heroHasRealFeed: boolean;
  sceneUrl: string | null;
  webglAvailable: boolean;
}): boolean {
  return input.mode === "room" && !input.heroHasRealFeed && Boolean(input.sceneUrl) && input.webglAvailable;
}

export function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
