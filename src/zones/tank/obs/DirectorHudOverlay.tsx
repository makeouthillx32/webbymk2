"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { type OverlayCamera } from "./overlayCamera";
import { useObsTransparentPage } from "./useObsTransparentPage";
import { useBuildReload } from "./useBuildReload";
import { resolveText } from "./overlaySettings";
import { useOverlaySettings } from "./useOverlaySettings";
import { useOverlayFx } from "./useOverlayFx";
import { resolveOverlaySkin } from "./overlaySkin";
import { RecBadge } from "./hud/RecBadge";
import { RoomCaption } from "./hud/RoomCaption";
import { Timecode } from "./hud/Timecode";

type Props = {
  camera?: OverlayCamera | null;
  standalone?: boolean;
};

/**
 * The full CCTV HUD: REC badge, room caption and timecode across the top.
 *
 * COMPOSED FROM THE SAME PIECES that are published as their own browser
 * sources, rather than being a second implementation of them. That is the whole
 * point of the split — an operator who prefers one bar keeps this, an operator
 * who wants the room name bottom-left and the clock top-right adds the pieces
 * individually, and neither can drift from the other because there is only one
 * copy of each.
 *
 * One skin is resolved here and pushed down. Left to themselves the children
 * would each read their own stored settings, so a composed bar could end up
 * with an aluminium REC badge beside a clean clock.
 */
export function DirectorHudOverlay({ camera: propCamera, standalone = true }: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings("hud", standalone);
  // A live chaos fx (inventory item) overrides the configured texture until
  // it expires. The URL stays the escape hatch: a texture pinned in a query
  // param keeps its authority, same as every other overlay setting.
  const fx = useOverlayFx();
  const resolvedTexture = resolveText("texture", searchParams, stored, "clean");
  const skin = resolveOverlaySkin(
    fx && resolvedTexture.from !== "query" ? fx.texture : resolvedTexture.value,
  );
  // Read under the "hud" id and handed down, so a caption override saved
  // against the combined bar keeps working now that it is its own component.
  const label = resolveText("label", searchParams, stored).value;

  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  const content = (
    <div className="flex w-full items-center justify-between gap-3 select-none pointer-events-none">
      <div className="flex items-center gap-2.5 sm:gap-3">
        <RecBadge standalone={false} skinOverride={skin} />
        <RoomCaption
          standalone={false}
          camera={propCamera}
          skinOverride={skin}
          labelOverride={label}
        />
      </div>
      <div className="flex items-center gap-2">
        <Timecode standalone={false} skinOverride={skin} />
      </div>
    </div>
  );

  if (!standalone) {
    return content;
  }

  return (
    <main className="fixed inset-x-0 top-0 p-4 sm:p-6 bg-transparent pointer-events-none select-none z-30">
      {content}
    </main>
  );
}

export default DirectorHudOverlay;
