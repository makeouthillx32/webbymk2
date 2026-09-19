"use client";

import React from "react";
import { Users, Coins, Trophy, Archive, AudioLines, Vote } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import { PanelCollapseButton } from "./PanelCollapseButton";

export type OverlayType = "clicks" | "tokens" | "season" | "leaderboard" | "archives" | "audio-request" | "poll";

export type NavigationPanelProps = {
  onSelectOverlay: (key: OverlayType) => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
};

export function NavigationPanel({
  onSelectOverlay,
  expanded = true,
  onExpandedChange,
}: NavigationPanelProps) {
  const navItems = [
    { key: "poll" as const, label: "Live Poll", icon: Vote },
    { key: "clicks" as const, label: "Clicks", icon: Users },
    { key: "tokens" as const, label: "Tokens", icon: Coins },
    { key: "season" as const, label: "Season Pass", icon: Trophy },
    { key: "leaderboard" as const, label: "Leader Board", icon: Trophy },
    { key: "archives" as const, label: "Archives", icon: Archive },
    { key: "audio-request" as const, label: "TTS / SFX", icon: AudioLines },
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
          style={{
            fontFamily: ACTIVE_THEME.fonts.label,
            color: "var(--tank-color-text-dark, #241f14)",
          }}
        >
          Navigation
        </span>
        {onExpandedChange && (
          <PanelCollapseButton
            title="Navigation"
            expanded={expanded}
            onExpandedChange={onExpandedChange}
          />
        )}
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 px-6 py-4">
          {navItems.map(({ key, label, icon: Icon }) => (
            <ConsoleButton
              key={key}
              className="w-full !justify-start normal-case shadow-sm"
              href={key === "archives" ? "/archives" : undefined}
              onClick={key === "archives" ? undefined : () => onSelectOverlay(key)}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span style={{ fontFamily: ACTIVE_THEME.fonts.labelWide }}>{label}</span>
            </ConsoleButton>
          ))}
        </div>
      )}
    </ChromePanel>
  );
}
