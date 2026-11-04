import type { CameraDirectorySnapshot } from "../contracts";

/**
 * The viewer-safe view of the camera directory: admin audio routing and per
 * camera credential fingerprints removed, non-public cameras dropped, and the
 * cameras of switched-off rooms dropped with them.
 *
 * That last one was missing, and it broke the one safety property the room
 * kill-switch is supposed to have. `deriveRooms` omits an offline room from
 * `rooms`, so the room grid went dark as expected — but this function filtered
 * cameras on `publicVisible` alone, so the room's cameras stayed in `cameras`
 * with `presence: "online"` and a live WHEP `playbackUrl`. Any surface
 * rendering from `cameras` rather than `rooms` still showed the feed, and the
 * URL was there for anyone reading the response. See the doc comment on
 * RoomPresentationRow.isOffline, which states the intended guarantee:
 * "nothing about an offline room, including its camera URLs, ever leaves the
 * server."
 *
 * Filtering is driven by an explicit `offlineRoomKeys` list rather than by
 * "keep only cameras whose room survived in `rooms`". The latter reads more
 * elegantly and fails CLOSED: any snapshot with an empty `rooms` — the
 * fixture fallback, a bad DB read — would blank every camera on the site.
 * An explicit list fails open, so the worst case is the old behaviour rather
 * than an outage.
 *
 * The return type is declared rather than inferred so this stays substitutable
 * for the snapshot everywhere it is consumed — otherwise the stripping silently
 * produces a different shape and callers only find out at the assignment.
 */
export function toPublicCameraDirectory(snapshot: CameraDirectorySnapshot): CameraDirectorySnapshot {
  const {
    audioSources: _adminAudioSources,
    offlineRoomKeys: _adminOfflineRoomKeys,
    offAirRooms: _staffOffAirRooms,
    ...publicSnapshot
  } = snapshot;

  // Which rooms are off is itself admin information — the public payload should
  // not enumerate rooms that exist but are hidden.
  const offline = new Set(snapshot.offlineRoomKeys ?? []);

  return {
    ...publicSnapshot,
    cameras: snapshot.cameras
      .filter((camera) => camera.publicVisible)
      .filter((camera) => !offline.has(camera.roomScope))
      .map(({ keyFingerprint: _credentialFingerprint, ...camera }) => camera),
  };
}

/**
 * The staff view of the same directory: switched-off rooms stay in, tagged
 * `offAir`, with their cameras. Turning a room off is a decision about what
 * viewers see — ingest, vision and Axis tracking keep running, and the house
 * console has to keep seeing them (2026-11-04: with every room off, the
 * staff room read the public list and went blank).
 *
 * Only staff routes may serve this. Putting a camera on the programme still
 * goes through the public projection (serverDirectorEngine), so nothing here
 * can bring an off-air room to viewers.
 */
export function toStaffCameraDirectory(snapshot: CameraDirectorySnapshot): CameraDirectorySnapshot {
  const {
    audioSources: _adminAudioSources,
    offlineRoomKeys: _offlineRoomKeys,
    offAirRooms = [],
    ...staffSnapshot
  } = snapshot;
  return {
    ...staffSnapshot,
    rooms: [...(snapshot.rooms ?? []), ...offAirRooms].sort((a, b) => a.title.localeCompare(b.title)),
    cameras: snapshot.cameras
      .filter((camera) => camera.publicVisible)
      .map(({ keyFingerprint: _credentialFingerprint, ...camera }) => camera),
  };
}
