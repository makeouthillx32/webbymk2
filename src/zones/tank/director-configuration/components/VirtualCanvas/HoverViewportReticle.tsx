"use client";

import React from "react";
import type { CameraTileBounds } from "../../../server/directorVirtualAtlas";

type HoverViewportReticleProps = {
  tile: CameraTileBounds;
  isLead: boolean;
};

export function HoverViewportReticle({ tile, isLead }: HoverViewportReticleProps) {
  if (!isLead) return null;

  return (
    <div className="absolute inset-0 pointer-events-none rounded-xl border-2 border-dashed border-orange-400 animate-pulse flex flex-col justify-between p-1 z-20 shadow-[0_0_25px_rgba(249,115,22,0.5)]">
      {/* Top Banner */}
      <div className="flex items-center justify-between text-[8px] font-black uppercase text-orange-400 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/40">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-ping" />
          ┌ DIRECTOR VIEWPORT SNAP ┐
        </span>
        <span className="font-mono text-emerald-400">[4K PROGRAM RELAY]</span>
      </div>

      {/* Center Reticle Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
        <div className="relative w-8 h-8">
          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-orange-400 -translate-y-1/2" />
          <div className="absolute top-0 left-1/2 w-[1px] h-full bg-orange-400 -translate-x-1/2" />
          <div className="absolute inset-1 rounded-full border border-orange-400" />
        </div>
      </div>

      {/* Bottom Coordinates & Scale */}
      <div className="flex items-center justify-between text-[8px] font-mono text-orange-300 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/40">
        <span>
          X: {tile.xMin} · Y: {tile.yMin}
        </span>
        <span>└ 3840x2160 NATIVE ┘</span>
      </div>
    </div>
  );
}
export default HoverViewportReticle;
