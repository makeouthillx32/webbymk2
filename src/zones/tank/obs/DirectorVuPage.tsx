import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { DirectorVuOverlay } from "./DirectorVuOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Director Audio VU & Watermark Overlay",
  robots: { index: false, follow: false },
};

export default function DirectorVuPage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <DirectorVuOverlay standalone />
      </Suspense>
    </>
  );
}
