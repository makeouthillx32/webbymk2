import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomOfflineOverlay } from "./RoomOfflineOverlay";
import { TankThemeStyles } from "../public/TankThemeStyles";
import { ObsTransparentStyle } from "./ObsTransparentStyle";

// force-dynamic + Suspense: RoomOfflineOverlay reads useSearchParams, which
// Next 15 refuses to prerender without a boundary. Same shape as the director
// OBS source next door.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tank Live · OBS Room Offline Overlay",
  description:
    "Browser source that stays invisible while a room is live and takes over the scene when it goes offline.",
};

export default function ObsRoomOfflinePage() {
  return (
    <>
      {/* Injects the Tank @font-face rules; without it the card falls back to
          the monospace stack, which still reads correctly but off-brand. */}
      <ObsTransparentStyle />
      <TankThemeStyles />
      <Suspense fallback={null}>
        <RoomOfflineOverlay />
      </Suspense>
    </>
  );
}
