import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { DirectorGoalOverlay } from "./DirectorGoalOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Stream Goal Overlay",
  robots: { index: false, follow: false },
};

export default function DirectorGoalPage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <DirectorGoalOverlay standalone />
      </Suspense>
    </>
  );
}
