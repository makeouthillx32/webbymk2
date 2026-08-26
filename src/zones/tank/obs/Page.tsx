import type { Metadata } from "next";
import { DirectorObsScene } from "./DirectorObsScene";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tank Live · OBS Director Source",
  description: "High-performance automated Director scene for OBS Studio browser source.",
};

export default function ObsDirectorPage() {
  return <DirectorObsScene />;
}
