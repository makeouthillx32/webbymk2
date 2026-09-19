import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { DirectorHudOverlay } from "./DirectorHudOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Director CCTV HUD Overlay",
  robots: { index: false, follow: false },
};

export default function DirectorHudPage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <DirectorHudOverlay standalone />
      </Suspense>
    </>
  );
}
