"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useObsTransparentPage } from "../useObsTransparentPage";
import { useBuildReload } from "../useBuildReload";
import { resolveText } from "../overlaySettings";
import { useOverlaySettings } from "../useOverlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "../overlaySkin";
import { overlayCameraLabel, type OverlayCamera } from "../overlayCamera";
import { useDirectorRoom } from "./useDirectorRoom";
import { HudPanel, HudStandaloneFrame } from "./HudPanel";

type Props = {
  standalone?: boolean;
  /** Composed usage may hand in the camera; standalone resolves its own. */
  camera?: OverlayCamera | null;
  skinOverride?: ReturnType<typeof resolveOverlaySkin>;
  /**
   * Composed usage passes its own label down, so a caption override set on the
   * combined HUD keeps applying once the bar is composed.
   */
  labelOverride?: string | null;
};

/**
 * The room name currently on the programme.
 *
 * ALWAYS the director's room. The "Lock to room" option was removed 2026-09-13:
 * these overlays exist to describe the Director Programme, and a pinned caption
 * is a way for them to silently describe the wrong thing. One less control is
 * one less way for a live scene to be wrong.
 *
 * THE PIECE THAT FOLLOWS THE DIRECTOR. Everything else in the old HUD was
 * either static (REC) or independent of the room (the clock); this is the one
 * that has to track the cut, and splitting it out means it can be placed
 * wherever the shot allows without dragging a timecode along with it.
 *
 * `lock` pins it to one room instead — useful on a second scene built around a
 * fixed camera, and it is the only reason this overlay would ever say something
 * other than what the director is on.
 */
export function RoomCaption({
  standalone = true,
  camera: propCamera,
  skinOverride,
  labelOverride,
}: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings("room", standalone);
  const skin =
    skinOverride ?? resolveOverlaySkin(resolveText("texture", searchParams, stored, "clean").value);
  const labelParam = labelOverride ?? resolveText("label", searchParams, stored).value;

  const { camera } = useDirectorRoom();
  const activeCamera = propCamera ?? camera;

  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  // Shared with every other director surface, so two overlays can never caption
  // the same shot differently.
  const cameraDisplay = overlayCameraLabel(activeCamera, labelParam);

  const content = (
    <HudPanel skin={skin}>
      <span
        className="text-sm uppercase"
        style={{
          fontFamily: TANK_OVERLAY_FONTS.labelWide,
          color: skin.accent,
          textShadow: skin.textShadow,
          letterSpacing: "0.06em",
        }}
      >
        {cameraDisplay}
      </span>
    </HudPanel>
  );

  if (!standalone) return content;
  return <HudStandaloneFrame anchor="top-left">{content}</HudStandaloneFrame>;
}

export default RoomCaption;
