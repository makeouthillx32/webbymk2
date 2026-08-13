import type { Metadata } from "next";
import TankHomePage from "./public/HomePage";

export const metadata: Metadata = {
  title: "Tank | Live rooms, cameras, and community",
  description:
    "Watch the director feed, move between public cameras, and join live rooms on Tank.",
};

export default function TankPage() {
  return <TankHomePage />;
}
