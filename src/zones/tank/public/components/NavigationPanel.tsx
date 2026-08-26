"use client";

import React from "react";
import { Users, Coins, Trophy, Archive, AudioLines, Vote } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";

export type OverlayType = "clicks" | "tokens" | "season" | "leaderboard" | "archives" | "audio-request" | "poll";

export type NavigationPanelProps = {
  onSelectOverlay: (key: OverlayType) => void;
};

export function NavigationPanel({ onSelectOverlay }: NavigationPanelProps) {
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
      contentClassName="!px-6 !py-4 flex flex-col gap-2"
    >
      {navItems.map(({ key, label, icon: Icon }) => (
        <ConsoleButton
          key={key}
          className="w-full !justify-start normal-case shadow-sm"
          onClick={() => onSelectOverlay(key)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span style={{ fontFamily: ACTIVE_THEME.fonts.labelWide }}>{label}</span>
        </ConsoleButton>
      ))}
    </ChromePanel>
  );
}
