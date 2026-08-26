import type { Metadata } from "next";
import { MyStreamPage } from "@/zones/tank/obs/MyStreamPage";

export const metadata: Metadata = {
  title: "Your Tank Stream | Tank Console",
  description: "Generate your own OBS/Streamlabs stream key for a personal Tank room.",
};

export default function Page() {
  return <MyStreamPage />;
}
