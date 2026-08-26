// app/page.tsx
import type { Metadata } from "next";
import HomePage from "@/components/shop/Landing";

export const metadata: Metadata = {
  title: "Home | Unenter Solutions",
  description:
    "Western-inspired pants and shirts with a warm, modern rustic aesthetic. Thoughtfully designed staples made for everyday wear.",

  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.unenter.live"
  ),

  openGraph: {
    title: "Unenter Solutions | Western-Inspired Pants & Shirts",
    description:
      "Shop western-inspired pants and shirts with a warm, modern rustic look—quality staples made for everyday wear.",
    type: "website",
    url: "https://www.unenter.live/",
    siteName: "Unenter Solutions",
    images: [
      {
        url: "/opengraph-image.png",
        alt: "Unenter Solutions storefront preview",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Unenter Solutions | Western-Inspired Pants & Shirts",
    description:
      "Western-inspired pants and shirts with a warm, modern rustic aesthetic.",
    images: ["/twitter-image.png"],
  },
};

export default function Page() {
  return (
    <main className="flex-grow">
      <HomePage />
    </main>
  );
}