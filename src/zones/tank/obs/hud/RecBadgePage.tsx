import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../../public/TankThemeStyles";
import { ObsTransparentStyle } from "../ObsTransparentStyle";
import { RecBadge } from "./RecBadge";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS REC Badge",
  robots: { index: false, follow: false },
};

export default function RecBadgePage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <RecBadge standalone />
      </Suspense>
    </>
  );
}
