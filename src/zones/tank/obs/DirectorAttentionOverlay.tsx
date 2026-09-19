"use client";

import React, { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useDirectorAttention } from "../director/useDirectorAttention";
import { useObsTransparentPage } from "./useObsTransparentPage";
import { useBuildReload } from "./useBuildReload";
import { resolveBoolean, resolveText } from "./overlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "./overlaySkin";
import { useOverlaySettings } from "./useOverlaySettings";

type Props = {
  standalone?: boolean;
  preview?: boolean;
};

export function DirectorAttentionOverlay({ standalone = true, preview = false }: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings(standalone ? "attention" : "director", true);
  const isPreview =
    preview ||
    resolveBoolean("preview", searchParams, stored, false).value;
  const customTarget = resolveText("target", searchParams, stored).value;
  const skin = resolveOverlaySkin(resolveText("texture", searchParams, stored, "clean").value);

  const {
    attentionLock,
    timeRemainingSeconds,
  } = useDirectorAttention();

  // One owner for the transparency trick; see useObsTransparentPage for why it
  // must never run when this overlay is composed inside another page.
  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  const formatTimer = (seconds: number | null) => {
    if (seconds === null) return "LOCK";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isVisible = attentionLock.active || isPreview;
  if (!isVisible) {
    return null;
  }

  const label = customTarget || (attentionLock.active ? attentionLock.targetLabel : "DEMO ATTENTION LOCK");
  const timerDisplay = attentionLock.active ? formatTimer(timeRemainingSeconds) : "04:59";

  const content = (
    <div className="flex items-center justify-center select-none pointer-events-none">
      <div
        className="flex items-center gap-2.5 px-4 py-1.5 uppercase text-sm tracking-wider animate-pulse"
        style={{
          ...skin.panel,
          fontFamily: TANK_OVERLAY_FONTS.stamp,
          color: skin.ink,
          textShadow: skin.textShadow,
          // The banner keeps its urgency glow on every skin — it is the one
          // overlay whose whole job is to be noticed mid-shot.
          boxShadow: `${skin.panel.boxShadow}, 0 0 20px ${skin.accent}99`,
          borderColor: skin.accent,
        }}
      >
        <span style={{ color: skin.accent }}>&#9673;</span>
        <span>ATTENTION LOCKED: {label}</span>
        <span
          className="px-2 py-0.5 rounded tracking-normal text-[12px]"
          style={{
            fontFamily: TANK_OVERLAY_FONTS.display,
            backgroundColor: skin.isLight ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.6)",
            color: skin.accent,
            textShadow: "none",
          }}
        >
          {timerDisplay}
        </span>
      </div>
    </div>
  );

  if (!standalone) {
    return content;
  }

  return (
    <main className="fixed inset-x-0 top-6 sm:top-8 flex justify-center p-4 bg-transparent pointer-events-none select-none z-30">
      {content}
    </main>
  );
}

export default DirectorAttentionOverlay;
