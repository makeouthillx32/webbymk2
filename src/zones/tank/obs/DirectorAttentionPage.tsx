import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { DirectorAttentionOverlay } from "./DirectorAttentionOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Director Attention Overlay",
  robots: { index: false, follow: false },
};

export default function DirectorAttentionPage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <DirectorAttentionOverlay standalone />
      </Suspense>
    </>
  );
}
