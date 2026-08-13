import type { Metadata } from "next";
import RoomPage from "@/zones/tank/public/RoomPage";
import { roomBySlug, rooms } from "@/zones/tank/fixtures";

export function generateStaticParams() {
  return rooms.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const room = roomBySlug(slug);
  return {
    title: room ? `${room.title} | Tank` : "Room | Tank",
    description: room?.description,
  };
}
export default async function TankRoomRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <RoomPage slug={slug} />;
}
