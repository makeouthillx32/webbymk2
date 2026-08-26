import type { CameraDirectorySnapshot, DerivedRoom, DiscoveredCamera, RoomVisibilityPolicy } from "../contracts";
import type { RoomPresentationRow } from "./cameraRegistryDb";

// Only a fixed IP camera is a real, physically-plugged-in device that
// justifies a persistent "no signal" room when it's offline. SRT/SRTLA are
// push-based ingest from a remote encoder (phone, OBS) that may or may not
// exist right now — same "no stream, no room" lifecycle as RTMP, not the
// same as ip-camera. Previously included srt/srtla here, which made a
// SRTLA-only "Roaming" room permanently visible even with nobody streaming
// into it — see also the online-gating fix in receiverManager.ts.
const ALWAYS_SHOW_PROTOCOLS = new Set(["ip-camera"]);

function titleCase(roomScope: string): string {
  return roomScope
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function inferPolicy(cameras: DiscoveredCamera[]): RoomVisibilityPolicy {
  return cameras.some((camera) => ALWAYS_SHOW_PROTOCOLS.has(camera.protocol))
    ? "always-show"
    : "live-only";
}

// Rooms only exist here because cameras back them — never a hand-maintained
// list. Only publicVisible cameras count: a room made of private/backstage
// cameras shouldn't appear on the public experience at all.
//
// always-show rooms (any fixed ip-camera in the group) persist even when
// every camera in them is offline, rendered with a "no signal" state — an
// admin wants to see a dead room, that's useful ops visibility.
//
// live-only rooms (every camera in the group is SRT/SRTLA/RTMP — push-based
// ingest with no persistent device behind it) only appear while at least one
// camera is actually online/degraded — "if there's no feed, there's no room."
//
// An admin's explicit tank_rooms.visibility_policy always overrides the
// inference above.
export function deriveRooms(
  cameras: DiscoveredCamera[],
  presentation: RoomPresentationRow[],
): DerivedRoom[] {
  const presentationByKey = new Map(presentation.map((row) => [row.roomKey, row]));

  const groups = new Map<string, DiscoveredCamera[]>();
  for (const camera of cameras) {
    if (!camera.publicVisible) continue;
    const group = groups.get(camera.roomScope);
    if (group) group.push(camera);
    else groups.set(camera.roomScope, [camera]);
  }

  const rooms: DerivedRoom[] = [];
  for (const [roomKey, groupCameras] of groups) {
    const curated = presentationByKey.get(roomKey);
    const visibilityPolicy = curated?.visibilityPolicy ?? inferPolicy(groupCameras);
    const anyOnline = groupCameras.some(
      (camera) => camera.presence === "online" || camera.presence === "degraded",
    );

    if (visibilityPolicy === "live-only" && !anyOnline) continue;

    const sorted = [...groupCameras].sort((a, b) => a.priority - b.priority);
    const featured = sorted.find((camera) => camera.presence === "online" || camera.presence === "degraded")
      ?? sorted[0];

    rooms.push({
      roomKey,
      title: curated?.title || titleCase(roomKey),
      eyebrow: curated?.eyebrow || "",
      description: curated?.description || "",
      tags: curated?.tags.length ? curated.tags : [],
      visibilityPolicy,
      cameraIds: sorted.map((camera) => camera.id),
      featuredCameraId: featured.id,
      anyOnline,
      audioOutputKind: curated?.audioOutputKind ?? "embedded",
      audioOutputConfig: curated?.audioOutputConfig ?? {},
      audioInputSourceId: curated?.audioInputSourceId ?? null,
    });
  }

  return rooms.sort((a, b) => a.title.localeCompare(b.title));
}
