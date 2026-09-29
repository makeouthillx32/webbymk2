import { loadRoomPresentation } from "./cameraRegistryDb";
import { getCameraDirectorySnapshot } from "./receiverManager";

/**
 * Per-room status for the OBS offline overlay.
 *
 * Deliberately narrow: it answers "what is the state of THIS room", named by
 * the caller, rather than enumerating which rooms are switched off. The public
 * camera payload strips `offlineRoomKeys` precisely so the site does not
 * advertise hidden rooms, and this must not quietly undo that — an operator
 * putting a room's own key in an OBS browser source is a different thing from
 * publishing the whole list.
 */
export type RoomOverlayStatus = {
  roomKey: string;
  /** Curated title if the room is enrolled, else a title-cased key. */
  title: string;
  /** The admin kill-switch: tank_rooms.is_offline. */
  offline: boolean;
  /** Whether any camera in the room is currently carrying a feed. */
  anyOnline: boolean;
  /**
   * False when the camera directory could not be read in time, meaning
   * `anyOnline` is an assumption rather than an observation. The overlay uses
   * this to avoid covering a feed it simply failed to check on.
   */
  cameraStateKnown: boolean;
  /** False when no such room is enrolled — the overlay stays hidden. */
  known: boolean;
  checkedAt: string;
};

/**
 * The camera directory is normally a cached in-memory read, but it can fall
 * back to hitting the receiver manager and MediaMTX. This endpoint is polled by
 * a live broadcast overlay, so it must answer promptly or not at all — a slow
 * answer is worse than a partial one.
 */
const SNAPSHOT_BUDGET_MS = 2000;

function titleCase(roomKey: string): string {
  return roomKey
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function withBudget<T>(promise: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(promise).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export async function getRoomOverlayStatus(roomKey: string): Promise<RoomOverlayStatus> {
  const key = roomKey.trim().toLowerCase();

  const [presentation, snapshot] = await Promise.all([
    loadRoomPresentation().catch(() => []),
    withBudget(getCameraDirectorySnapshot(), SNAPSHOT_BUDGET_MS),
  ]);

  const row = presentation.find((entry) => entry.roomKey === key);

  // The RAW snapshot on purpose: deriveRooms has already dropped offline rooms
  // from `rooms`, so an offline room's cameras are only visible here. Reading
  // the public projection would report every switched-off room as having no
  // feed, which is true of the payload but not of the house.
  const cameraStateKnown = snapshot !== null;
  const cameras = (snapshot?.cameras ?? []).filter((camera) => camera.roomScope === key);

  // When the directory could not be read, claim the feed IS live. That looks
  // backwards until you consider which way this fails: the overlay's
  // "nosignal"/"both" modes show a full-screen card when anyOnline is false, so
  // defaulting to false would black out a healthy broadcast every time this
  // read timed out. Claiming "live" means the worst case is a missed overlay.
  const anyOnline = cameraStateKnown
    ? cameras.some((camera) => camera.presence === "online" || camera.presence === "degraded")
    : true;

  return {
    roomKey: key,
    title: row?.title?.trim() || titleCase(key),
    // The kill-switch comes from the small, cheap presentation read, so this —
    // the overlay's primary trigger — stays accurate even when the directory
    // read is skipped.
    offline: row?.isOffline === true,
    anyOnline,
    cameraStateKnown,
    known: Boolean(row) || cameras.length > 0,
    checkedAt: new Date().toISOString(),
  };
}
