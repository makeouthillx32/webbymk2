import type { Metadata } from "next";
import { ObsHubPage } from "@/zones/tank/obs/ObsHubPage";

export const metadata: Metadata = {
  title: "Tank Live · OBS Browser Source Setup",
  description: "Configure and generate OBS Studio browser source URLs for Tank Director.",
};

export default function Page() {
  return <ObsHubPage />;
}
