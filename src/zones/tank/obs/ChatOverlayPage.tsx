import type { Metadata } from "next";
import { Suspense } from "react";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";
import { TankChatObsOverlay } from "./TankChatObsOverlay";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tank Live · OBS Chat Overlay", robots: { index: false, follow: false } };

export default function ChatOverlayPage() {
  return <><ObsTransparentStyle />
      <TankThemeStyles /><Suspense fallback={null}><TankChatObsOverlay /></Suspense></>;
}

