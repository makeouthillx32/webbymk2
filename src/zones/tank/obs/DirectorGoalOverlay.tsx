"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useObsTransparentPage } from "./useObsTransparentPage";
import { useBuildReload } from "./useBuildReload";
import { resolveBoolean, resolveNumber, resolveText } from "./overlaySettings";
import { resolveOverlaySkin, TANK_OVERLAY_FONTS } from "./overlaySkin";
import { useOverlaySettings } from "./useOverlaySettings";
import { useStreamGoal } from "./useStreamGoal";

type Props = {
  standalone?: boolean;
  /** Refresh cadence, exposed for the workshop preview. */
  refreshMs?: number;
};

/**
 * The goal bar — "Follower goal 243 / 254".
 *
 * Renders NOTHING when no goal is active. That is the whole safety story for a
 * browser source that sits in a scene permanently: staff turn a goal on and it
 * appears, turn it off and it is gone, and neither action requires touching
 * OBS. An overlay that always drew something would have to be added and removed
 * from the scene by hand every time.
 */
export function DirectorGoalOverlay({ standalone = true, refreshMs }: Props) {
  const searchParams = useSearchParams();
  const stored = useOverlaySettings("goal", true);

  const goal = useStreamGoal(refreshMs);

  const position = resolveText("position", searchParams, stored, "bottom").value ?? "bottom";
  const showPercent = resolveBoolean("percent", searchParams, stored, true).value;
  const barWidth = resolveNumber("width", searchParams, stored, 420, 160, 1600).value;
  const labelOverride = resolveText("label", searchParams, stored, "").value ?? "";
  const accentOverride = resolveText("accent", searchParams, stored, "").value ?? "";
  const skin = resolveOverlaySkin(resolveText("texture", searchParams, stored, "clean").value);

  useObsTransparentPage(standalone);
  // Pick up a redeploy without anyone right-clicking this source in OBS.
  useBuildReload(standalone);

  if (!goal) return null;

  // Precedence: URL/stored override, then the goal's own colour, then the
  // skin. The goal colour is staff-chosen per goal, so it outranks the skin.
  const accent = /^#[0-9a-f]{3,8}$/i.test(accentOverride)
    ? accentOverride
    : goal.accentColor || skin.accent;
  const label = labelOverride.trim() || goal.label;

  const content = (
    <div
      className="select-none pointer-events-none px-4 py-3"
      style={{ ...skin.panel, width: barWidth }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span
          className="text-sm uppercase tracking-widest truncate"
          style={{ fontFamily: TANK_OVERLAY_FONTS.labelWide, color: skin.ink, textShadow: skin.textShadow }}
        >
          {label}
        </span>
        {goal.showCount ? (
          <span
            className="text-base whitespace-nowrap tabular-nums"
            style={{ fontFamily: TANK_OVERLAY_FONTS.display, color: skin.ink, textShadow: skin.textShadow }}
          >
            {goal.current.toLocaleString()}
            <span style={{ color: skin.inkMuted }}> / {goal.target.toLocaleString()}</span>
          </span>
        ) : null}
      </div>

      <div
        className="h-2.5 w-full rounded-full overflow-hidden relative"
        style={{
          backgroundColor: skin.isLight ? "rgba(0,0,0,0.35)" : "#1e293b",
          border: `1px solid ${skin.isLight ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.1)"}`,
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${goal.percent}%`,
            // Inline because the accent is operator-chosen at runtime; there is
            // no class for an arbitrary hex.
            background: goal.complete
              ? `linear-gradient(90deg, ${accent}, #ffffff)`
              : accent,
            boxShadow: `0 0 12px ${accent}66`,
          }}
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 mt-1.5">
        <span
          className="text-[11px] uppercase tracking-wider"
          style={{ fontFamily: TANK_OVERLAY_FONTS.label, color: skin.inkMuted, textShadow: skin.textShadow }}
        >
          {goal.complete ? "goal met" : `${goal.remaining.toLocaleString()} to go`}
        </span>
        {showPercent ? (
          <span
            className="text-[12px] tabular-nums"
            style={{ fontFamily: TANK_OVERLAY_FONTS.dotMatrix, color: accent, textShadow: skin.textShadow }}
          >
            {goal.percent}%
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!standalone) return content;

  const anchor =
    position === "top"
      ? "fixed inset-x-0 top-0 justify-center"
      : position === "top-left"
        ? "fixed inset-x-0 top-0 justify-start"
        : position === "top-right"
          ? "fixed inset-x-0 top-0 justify-end"
          : position === "bottom-left"
            ? "fixed inset-x-0 bottom-0 justify-start"
            : position === "bottom-right"
              ? "fixed inset-x-0 bottom-0 justify-end"
              : "fixed inset-x-0 bottom-0 justify-center";

  return (
    <main className={`${anchor} flex p-4 sm:p-6 bg-transparent pointer-events-none select-none z-30`}>
      {content}
    </main>
  );
}

export default DirectorGoalOverlay;
