import type { Metadata } from "next";
import TankPage from "@/zones/tank/Page";

export const metadata: Metadata = {
  title: "All Rooms | Tank LIVE",
  description: "Browse every public live room and camera on Tank.",
  alternates: { canonical: "https://tank.unenter.live/rooms" },
  openGraph: {
    type: "website",
    url: "https://tank.unenter.live/rooms",
    siteName: "Tank LIVE",
    title: "All Rooms | Tank LIVE",
    description: "Browse every public live room and camera on Tank.",
  },
};

export default function AllTankRoomsPage() {
  return <TankPage initialLocation={{ mode: "grid" }} />;
}
