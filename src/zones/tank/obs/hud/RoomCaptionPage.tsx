import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../../public/TankThemeStyles";
import { ObsTransparentStyle } from "../ObsTransparentStyle";
import { RoomCaption } from "./RoomCaption";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Tank Live · OBS Room Caption",
  robots: { index: false, follow: false },
};

export default function RoomCaptionPage() {
  return (
    <>
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <RoomCaption standalone />
      </Suspense>
    </>
  );
}
