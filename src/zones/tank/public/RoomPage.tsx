import { notFound } from "next/navigation";
import { cameraById, channels, roomBySlug } from "../fixtures";
import { PublicShell } from "./PublicShell";
import { RoomExperience } from "./RoomExperience";

export default function RoomPage({ slug }: { slug: string }) {
  const room = roomBySlug(slug);
  if (!room) notFound();
  const channel = channels.find((item) => item.id === room.channelId);
  if (!channel) notFound();
  const roomCameras = room.cameraIds
    .map(cameraById)
    .filter((camera) => camera?.isPublic && camera.enabled);
  return (
    <PublicShell>
      <RoomExperience room={room} channel={channel} roomCameras={roomCameras} />
    </PublicShell>
  );
}
