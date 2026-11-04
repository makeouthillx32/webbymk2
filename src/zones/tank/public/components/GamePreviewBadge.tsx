"use client";

import { Gamepad2 } from "lucide-react";

/** Marks a tile showing a game cam, so nobody mistakes it for a live feed. */
export function GamePreviewBadge() {
  return (
    <span
      data-tank-game-badge
      className="pointer-events-none absolute bottom-2 right-2 z-20 flex items-center gap-1 rounded bg-fuchsia-600/90 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow"
    >
      <Gamepad2 className="h-3 w-3" aria-hidden />
      Game
    </span>
  );
}
