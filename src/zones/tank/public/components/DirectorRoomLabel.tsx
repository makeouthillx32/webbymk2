"use client";

import React from "react";
import { ACTIVE_THEME } from "../../theme";

// The only thing the director feed puts on top of the video: which room you're
// watching, as plain text. No pill, no border, no backdrop — just a drop shadow
// so it stays readable over a bright frame.
//
// Director mode and the auto-cycle countdown deliberately do NOT live here.
// They're diagnostics, and they belong in the Stats for Nerds HUD where you
// open them when you want them instead of having them sit on the picture.
export type DirectorRoomLabelProps = {
  roomTitle?: string;
  className?: string;
};

export function DirectorRoomLabel({ roomTitle, className = "" }: DirectorRoomLabelProps) {
  if (!roomTitle) return null;

  return (
    <span
      className={`pointer-events-none absolute top-3 left-4 z-20 select-none text-sm font-bold tracking-wide text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] ${className}`}
      style={{ fontFamily: ACTIVE_THEME.fonts.label }}
    >
      {roomTitle}
    </span>
  );
}

export default DirectorRoomLabel;
