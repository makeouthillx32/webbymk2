import type { DiscoveredCamera } from "../contracts";
import { getCameraShareImageUrl, getObsRoomShareImageUrl } from "../mediaPlayback";
import { toPublicCameraDirectory } from "./publicCameraProjection";
import { getCameraDirectorySnapshot } from "./receiverManager";
import { getServerDirectorState } from "./serverDirectorEngine";

export type RoomShareImage = {
  title: string;
  description: string;
  live: boolean;
  frameUrl: string | null;
};

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function frameFor(camera: DiscoveredCamera | undefined) {
  if (!camera) return null;
  return camera.protocol === "rtmp" || camera.id.startsWith("obs-")
    ? getObsRoomShareImageUrl(camera.slug)
    : getCameraShareImageUrl(camera.id);
}

export async function resolveRoomShareImage(slug: string): Promise<RoomShareImage> {
  const snapshot = toPublicCameraDirectory(await getCameraDirectorySnapshot());

  if (slug === "director") {
    const director = await getServerDirectorState().catch(() => null);
    const active = director
      ? snapshot.cameras.find((camera) => camera.id === director.activeCameraId)
      : undefined;
    return {
      title: "Director",
      description: "Tank's live directed program feed.",
      live: active?.presence === "online" || active?.presence === "degraded",
      frameUrl: frameFor(active),
    };
  }

  const room = snapshot.rooms.find((entry) => entry.roomKey === slug);
  const featured = room
    ? snapshot.cameras.find((camera) => camera.id === room.featuredCameraId)
    : undefined;
  return {
    title: room?.title || titleFromSlug(slug),
    description: room?.description || `Watch ${titleFromSlug(slug)} live on Tank.`,
    live: room?.anyOnline === true,
    frameUrl: frameFor(featured),
  };
}
