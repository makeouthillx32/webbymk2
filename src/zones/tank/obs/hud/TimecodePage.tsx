import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../../public/TankThemeStyles";
import { ObsTransparentStyle } from "../ObsTransparentStyle";
import { Timecode } from "./Timecode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Timecode",
  robots: { index: false, follow: false },
};

export default function TimecodePage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <Timecode standalone />
      </Suspense>
    </>
  );
}
