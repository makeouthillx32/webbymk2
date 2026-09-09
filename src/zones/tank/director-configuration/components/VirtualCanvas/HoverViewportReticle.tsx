"use client";

import React from "react";
import type { CameraTileBounds } from "../../../server/directorVirtualAtlas";
import { Crosshair } from "lucide-react";

type HoverViewportReticleProps = {
  tile: CameraTileBounds;
  isLead: boolean;
  zoomFactor?: number;
  panOffsetX?: number;
  panOffsetY?: number;
};

export function HoverViewportReticle({
  tile,
  isLead,
  zoomFactor = 1,
  panOffsetX = 0,
  panOffsetY = 0,
}: HoverViewportReticleProps) {
  if (!isLead) return null;

  const zoom = zoomFactor > 1 ? zoomFactor : 1;
  const currentW = Math.round(3840 / zoom);
  const currentH = Math.round(2160 / zoom);
  const currentX = tile.xMin + panOffsetX;
  const currentY = tile.yMin + panOffsetY;

  const widthPct = 100 / zoom;
  const heightPct = 100 / zoom;
  const leftPct = (panOffsetX / 3840) * 100;
  const topPct = (panOffsetY / 2160) * 100;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* Outer border highlighting the active lead camera room */}
      <div className="absolute inset-0 border-2 border-orange-500/40 pointer-events-none" />

      {/* Dynamic Sized & Positioned Viewport Reticle Box (Gets smaller when zoomed) */}
      <div
        className="absolute border-2 border-orange-500 bg-orange-500/10 shadow-[0_0_20px_rgba(249,115,22,0.6)] flex flex-col justify-between p-1 transition-all duration-75"
        style={{
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
        }}
      >
        {/* Top Banner Tag */}
        <div className="flex items-center justify-between text-[7px] md:text-[8px] font-black uppercase text-orange-400 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/50 shadow">
          <span className="flex items-center gap-1 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
            {zoom > 1 ? `PTZ BOX (${zoom.toFixed(2)}x)` : "VIEWPORT SNAP"}
          </span>
          <span className="font-mono text-emerald-400">PROGRAM</span>
        </div>

        {/* Center Crosshair for precise pan targeting when zoomed */}
        {zoom > 1 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-60">
            <Crosshair className="h-5 w-5 text-orange-400" />
          </div>
        )}

        {/* Bottom Coordinates & Effective Resolution */}
        <div className="flex items-center justify-between text-[7px] md:text-[8px] font-mono text-orange-300 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/50 shadow">
          <span>
            {currentX},{currentY}
          </span>
          <span className={zoom > 1 ? "text-cyan-300 font-bold" : "text-slate-300"}>
            {currentW}x{currentH}
          </span>
        </div>
      </div>
    </div>
  );
}
export default HoverViewportReticle;
