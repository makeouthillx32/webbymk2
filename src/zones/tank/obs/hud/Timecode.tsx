"use client";

import React, { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useObsTransparentPage } from "../useObsTransparentPage";
import { useBuildReload } from "../useBuildReload";
import { resolveBoolean, resolveText } from "../overlaySettings";
import { useOverlaySettings } from "../useOverlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "../overlaySkin";
import { HudPanel, HudStandaloneFrame } from "./HudPanel";

type Props = {
  standalone?: boolean;
  skinOverride?: ReturnType<typeof resolveOverlaySkin>;
};

/** Wall clock, rendered on the Alarm Clock face — the font this readout exists for. */
export function Timecode({ standalone = true, skinOverride }: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings("clock", standalone);
  const skin =
    skinOverride ?? resolveOverlaySkin(resolveText("texture", searchParams, stored, "clean").value);
  const showSeconds = resolveBoolean("seconds", searchParams, stored, true).value;

  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          ...(showSeconds ? { second: "2-digit" as const } : {}),
        }),
      );
    };
    updateTime();
    // Ticking every second even when seconds are hidden keeps the minute roll
    // within a second of the real one; a 60s interval can be a full minute late.
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [showSeconds]);

  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  const content = (
    <HudPanel
      skin={skin}
      className="tracking-widest"
      style={{
        fontFamily: TANK_OVERLAY_FONTS.display,
        color: skin.ink,
        textShadow: skin.textShadow,
      }}
    >
      {/* The placeholder matches the real format, so the panel does not resize
          on the first tick and shift whatever sits beside it. */}
      <span className="text-base">{currentTime || (showSeconds ? "00:00:00" : "00:00")}</span>
    </HudPanel>
  );

  if (!standalone) return content;
  return <HudStandaloneFrame anchor="top-right">{content}</HudStandaloneFrame>;
}

export default Timecode;
