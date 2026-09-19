"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useObsTransparentPage } from "../useObsTransparentPage";
import { useBuildReload } from "../useBuildReload";
import { resolveText } from "../overlaySettings";
import { useOverlaySettings } from "../useOverlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "../overlaySkin";
import { HudPanel, HudStandaloneFrame } from "./HudPanel";

type Props = {
  standalone?: boolean;
  skinOverride?: ReturnType<typeof resolveOverlaySkin>;
};

/**
 * The pulsing REC dot and feed label.
 *
 * Split out of the combined HUD so it can be placed on its own — it is the one
 * piece that belongs in a fixed corner of every scene regardless of what the
 * rest of the HUD is doing.
 *
 * It carries NO room information on purpose. Recording is a property of the
 * programme, not of a room, so this piece has nothing to follow and nothing to
 * get out of sync with.
 */
export function RecBadge({ standalone = true, skinOverride }: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings("rec", standalone);
  const skin =
    skinOverride ?? resolveOverlaySkin(resolveText("texture", searchParams, stored, "clean").value);
  const feedLabel = resolveText("feed", searchParams, stored, "DIRECTOR FEED").value;

  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  const content = (
    <HudPanel skin={skin}>
      <span
        className="h-3 w-3 rounded-full animate-pulse"
        style={{ backgroundColor: skin.live, boxShadow: `0 0 8px ${skin.live}` }}
      />
      <span
        className="text-xs uppercase tracking-widest"
        style={{ fontFamily: TANK_OVERLAY_FONTS.label, color: skin.ink, textShadow: skin.textShadow }}
      >
        REC
      </span>
      {feedLabel ? (
        <>
          <span style={{ color: skin.inkMuted }}>|</span>
          <span
            className="text-xs uppercase tracking-wide"
            style={{
              fontFamily: TANK_OVERLAY_FONTS.label,
              color: skin.inkMuted,
              textShadow: skin.textShadow,
            }}
          >
            {feedLabel}
          </span>
        </>
      ) : null}
    </HudPanel>
  );

  if (!standalone) return content;
  return <HudStandaloneFrame anchor="top-left">{content}</HudStandaloneFrame>;
}

export default RecBadge;
