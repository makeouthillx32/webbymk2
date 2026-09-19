import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { TankTtsObsOverlay } from "./TankTtsObsOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tank Live · OBS TTS Overlay", robots: { index: false, follow: false } };

export default function TtsOverlayPage() {
  return <><ObsTransparentStyle />
      <TankThemeStyles /><Suspense fallback={null}><TankTtsObsOverlay /></Suspense></>;
}

