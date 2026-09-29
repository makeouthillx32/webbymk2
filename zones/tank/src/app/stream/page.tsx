import type { Metadata } from "next";
import { StreamDashboardPage } from "@/zones/tank/obs/StreamDashboardPage";

export const metadata: Metadata = {
  title: "Creator Dashboard | Tank",
  description: "Stream URL, stream key, and encoding settings for streaming into Tank.",
};

export default function Page() {
  return <StreamDashboardPage />;
}
