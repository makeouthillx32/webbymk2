"use client";

import React from "react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import { PanelCollapseButton } from "./PanelCollapseButton";

const LED_RED = "#ff3b2f";
const glow = (rgb: string) => ({ textShadow: `0 0 6px ${rgb}, 0 0 1px ${rgb}` });

export type TelemetryPanelProps = {
  seasonDay: number | null;
  now: Date | null;
  level: number;
  tokens: number;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function TelemetryPanel({
  seasonDay,
  now,
  level,
  tokens,
  expanded = true,
  onExpandedChange,
}: TelemetryPanelProps) {
  const telemetryData = [
    { label: "DAY", value: seasonDay ?? "—" },
    {
      label: "TIME",
      value: now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—",
    },
    { label: "LEVEL", value: level },
    { label: "TOKENS", value: tokens },
  ];

  return (
    <ChromePanel
      withScrews
      className="w-full"
      contentClassName="!p-0"
    >
      <div className="flex h-9 items-center justify-between gap-2 border-b border-black/40 px-4">
        <span
          className="text-[10px] font-black uppercase tracking-widest text-[#241f14]"
          style={{ fontFamily: ACTIVE_THEME.fonts.label }}
        >
          Season & Stats
        </span>
        {onExpandedChange && (
          <PanelCollapseButton
            title="Season & Stats"
            expanded={expanded}
            onExpandedChange={onExpandedChange}
          />
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-2 px-6 py-4">
          {telemetryData.map(({ label, value }) => (
            <div
              key={label}
              className="rounded border border-black/50 bg-black/90 px-2 py-1.5 text-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]"
            >
              <p className="text-[8px] font-bold tracking-widest text-[#7a8570]">
                {label}
              </p>
              <p
                className="text-sm font-black tracking-wider"
                style={{
                  color: LED_RED,
                  fontFamily: ACTIVE_THEME.fonts.display,
                  ...glow("rgba(255,59,47,.8)"),
                }}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      )}
    </ChromePanel>
  );
}
