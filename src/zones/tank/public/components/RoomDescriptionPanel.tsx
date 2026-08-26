"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";

const LED_GREEN = "#39ff6a";
const PANEL_TEXT = "#e7e2d6";

export type RoomDescriptionPanelProps = {
  title: string;
  description: string;
  live?: boolean;
  compact?: boolean;
};

export function RoomDescriptionPanel({
  title,
  description,
  live,
  compact = false,
}: RoomDescriptionPanelProps) {
  return (
    <ChromePanel
      withScrews
      className="w-full"
      contentClassName={
        compact ? "!px-7 !py-3 space-y-1.5" : "!px-8 !py-4 space-y-2"
      }
    >
      {live !== undefined && (
        <div className="flex justify-end">
          <span
            className={`flex shrink-0 items-center gap-1 text-[8px] font-black uppercase tracking-widest ${live ? "text-[#39ff6a]" : "text-[#f3b64a]"}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[#39ff6a] shadow-[0_0_6px_#39ff6a]" : "bg-[#f3b64a] shadow-[0_0_5px_#f3b64a]"}`}
            />
            {live ? "Live" : "Standby"}
          </span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1
          className={`${compact ? "text-base" : "text-xl"} font-black tracking-tight`}
          style={{
            color: PANEL_TEXT,
            fontFamily: ACTIVE_THEME.fonts.labelWide,
          }}
        >
          {title}
        </h1>
        <CheckCircle2 className="h-4 w-4" style={{ color: LED_GREEN }} />
      </div>
      <p className="max-w-3xl text-xs leading-relaxed text-[#cfc9b8] sm:text-sm">
        {description}
      </p>
    </ChromePanel>
  );
}
