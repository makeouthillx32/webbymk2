import type { CameraDirectorySnapshot, TankRoom } from "../contracts";

export type BrowseRoom = {
  id: string;
  roomKey: string;
  title: string;
  eyebrow: string;
  description: string;
  cameraIds: string[];
  live: boolean;
  tags: string[];
};

/**
 * The rooms a viewer can browse: the live snapshot's rooms, curated with the
 * fixture house rooms' titles and descriptions.
 *
 * Fixture rooms used to be added unconditionally "so every room is always
 * visible". That undid the room kill-switch on screen: deriveRooms() omits a
 * switched-off room, the fixtures put it straight back, and viewers got a dead
 * tile that told them to "provision this camera in the SRT app". It also kept
 * MobileRoomGrid's calm all-rooms-off message from ever showing.
 *
 * Fixtures are now the list only while there is no real directory to go on —
 * no snapshot yet, or the receiver manager unavailable — so a cold start or
 * an outage still shows the house rather than an empty page (fails open,
 * same as toPublicCameraDirectory).
 */
/**
 * `sceneRoomKeys` are rooms with a published 3D scene (see roomScenes.ts).
 * Those stay browsable while switched off — the viewer opens them and sees
 * the room in 3D instead of a camera feed — so a dark house is still a house.
 * They carry no cameras: nothing about the dark feed reaches the viewer.
 */
export function buildBrowseRooms(
  fixtureRooms: readonly TankRoom[],
  snapshot: Pick<CameraDirectorySnapshot, "source" | "rooms"> | null,
  sceneRoomKeys: ReadonlySet<string> = new Set(),
): BrowseRoom[] {
  const curatedByKey = new Map<string, BrowseRoom>();
  for (const room of fixtureRooms) {
    if (room.slug === "director") continue;
    curatedByKey.set(room.slug, {
      id: room.id,
      roomKey: room.slug,
      title: room.title,
      eyebrow: room.eyebrow,
      description: room.description,
      cameraIds: room.cameraIds,
      live: room.live,
      tags: room.tags,
    });
  }

  if (!snapshot || snapshot.source === "unavailable") {
    return Array.from(curatedByKey.values());
  }

  const rooms: BrowseRoom[] = [];
  for (const live of snapshot.rooms) {
    if (live.roomKey === "director") continue;
    const curated = curatedByKey.get(live.roomKey);
    const liveTags = live.tags?.filter(Boolean) ?? [];
    const fallbackDescription = liveTags.includes("obs")
      ? "A live room streamed by a Tank member."
      : liveTags.includes("mobile") || liveTags.includes("srtla")
        ? "A roaming IRL camera feed."
        : "Connected camera room view.";
    rooms.push({
      id: curated?.id ?? live.roomKey,
      roomKey: live.roomKey,
      title: live.title?.trim() || curated?.title || live.roomKey,
      eyebrow: live.eyebrow?.trim() || curated?.eyebrow || "Live room",
      description: live.description?.trim() || curated?.description || fallbackDescription,
      cameraIds: live.cameraIds,
      live: live.anyOnline,
      tags: liveTags.length > 0 ? liveTags : (curated?.tags ?? []),
    });
  }
  const listed = new Set(rooms.map((room) => room.roomKey));
  for (const [key, curated] of curatedByKey) {
    if (listed.has(key) || !sceneRoomKeys.has(key)) continue;
    rooms.push({ ...curated, eyebrow: "Off air · 3D room", cameraIds: [], live: false });
  }
  return rooms;
}
