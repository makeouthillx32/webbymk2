import React from "react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import type { TankSeason } from "../../server/gamification";

const LED_RED = "#ff3b2f";

export type SeasonMarqueeProps = {
  season: TankSeason | null;
};

export function SeasonMarquee({ season }: SeasonMarqueeProps) {
  const seasonTitle = season
    ? season.name.toLowerCase().startsWith("season")
      ? season.name.toUpperCase()
      : `SEASON ${season.number}: ${season.name.toUpperCase()}`
    : "SEASON 1: HOUSE RECKONING";

  return (
    <ChromePanel
      withScrews
      className="w-full"
      contentClassName="!px-4 !py-1.5 flex min-h-[54px] items-center justify-center"
    >
      <div
        className="flex w-full min-w-0 items-center justify-center gap-2.5 rounded border border-black/50 bg-black/90 px-3 py-1.5 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]"
        style={{
          borderRadius: "var(--tank-border-radius, 0.25rem)",
          backgroundImage: "var(--tank-texture-dark-panel, none)",
        }}
      >
        <span
          className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full"
          style={{
            background:
              "radial-gradient(circle at 35% 30%, #ff8a7a, #ff3b2f 55%, #7a0f0a)",
            boxShadow: "0 0 8px rgba(255,59,47,.9)",
          }}
        />
        <span
          className="truncate text-center text-xs font-black tracking-[.2em] sm:text-sm"
          style={{
            color: LED_RED,
            fontFamily: ACTIVE_THEME.fonts.display,
            textShadow: `0 0 6px rgba(255,59,47,.85), 0 0 1px rgba(255,59,47,.85)`,
          }}
        >
          {seasonTitle}
        </span>
      </div>
    </ChromePanel>
  );
}
