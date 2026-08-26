"use client";

import React from "react";
import { Sparkles, ShoppingBag, TrendingUp } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import type { TankSeason } from "../../server/gamification";

const LED_RED = "#ff3b2f";
const glow = (rgb: string) => ({ textShadow: `0 0 6px ${rgb}, 0 0 1px ${rgb}` });

export type TopConsoleStripProps = {
  season: TankSeason | null;
  onClaimDaily?: () => void;
  merchHref: string;
};

export function TopConsoleStrip({ season, onClaimDaily, merchHref }: TopConsoleStripProps) {
  const seasonTitle = season
    ? season.name.toLowerCase().startsWith("season")
      ? season.name.toUpperCase()
      : `SEASON ${season.number}: ${season.name.toUpperCase()}`
    : "SEASON 1: HOUSE RECKONING";

  return (
    <ChromePanel
      withScrews
      className="mb-2 w-full"
      contentClassName="!px-8 !py-3 flex flex-wrap items-center justify-between gap-3"
    >
      {/* Left section: Daily login */}
      <div className="flex items-center gap-2">
        <ConsoleButton
          variant="orange"
          onClick={onClaimDaily}
          className="shadow-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Daily login bonus
        </ConsoleButton>
      </div>

      {/* Center section: Large pulsing LED Marquee display */}
      <div className="flex min-w-[260px] max-w-xl flex-1 items-center justify-center gap-3 rounded border border-black/50 bg-black/90 px-4 py-2 shadow-[inset_0_2px_8px_rgba(0,0,0,0.8)]">
        <span
          className="h-3 w-3 shrink-0 animate-pulse rounded-full"
          style={{
            background: "radial-gradient(circle at 35% 30%, #ff8a7a, #ff3b2f 55%, #7a0f0a)",
            boxShadow: "0 0 8px rgba(255,59,47,.9)",
          }}
        />
        <span
          className="truncate text-center text-sm font-black tracking-[.22em] sm:text-base"
          style={{
            color: LED_RED,
            fontFamily: ACTIVE_THEME.fonts.display,
            ...glow("rgba(255,59,47,.85)"),
          }}
        >
          {seasonTitle}
        </span>
      </div>

      {/* Right section: Merch */}
      <div className="flex items-center gap-2">
        <ConsoleButton variant="orange" href={merchHref} className="hidden sm:inline-flex">
          <ShoppingBag className="h-3.5 w-3.5" />
          Merch
        </ConsoleButton>
      </div>
    </ChromePanel>
  );
}
