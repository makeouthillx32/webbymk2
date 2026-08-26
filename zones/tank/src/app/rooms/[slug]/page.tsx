import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TankPage from "@/zones/tank/Page";

type Props = { params: Promise<{ slug: string }> };

function cleanSlug(raw: string) {
  const slug = decodeURIComponent(raw).trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function roomTitle(slug: string) {
  if (slug === "director") return "Director";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const rawSlug = (await params).slug;
  const slug = cleanSlug(rawSlug);
  if (!slug) return {};
  const title = roomTitle(slug);
  const url = `https://tank.unenter.live/rooms/${encodeURIComponent(slug)}`;
  const image = `https://tank.unenter.live/api/tank/share/rooms/${encodeURIComponent(slug)}/image`;
  const description =
    slug === "director"
      ? "Watch Tank's live directed program feed."
      : `Watch ${title} live on Tank and join its room chat.`;

  return {
    title: `${title} | Tank LIVE`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: "Tank LIVE",
      title: `${title} | Tank LIVE`,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: `${title} live on Tank` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | Tank LIVE`,
      description,
      images: [image],
    },
  };
}

export default async function TankRoomPage({ params }: Props) {
  const slug = cleanSlug((await params).slug);
  if (!slug) notFound();
  return (
    <TankPage
      initialLocation={
        slug === "director" ? { mode: "director" } : { mode: "room", slug }
      }
    />
  );
}
