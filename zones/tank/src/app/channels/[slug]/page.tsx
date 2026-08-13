import type { Metadata } from "next";
import ChannelPage from "@/zones/tank/public/ChannelPage";
import { channelBySlug, channels } from "@/zones/tank/fixtures";

export function generateStaticParams() {
  return channels.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const channel = channelBySlug(slug);
  return {
    title: channel ? `${channel.name} | Tank` : "Channel | Tank",
    description: channel?.bio,
  };
}
export default async function TankChannelRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ChannelPage slug={slug} />;
}
