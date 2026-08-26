"use client";

import React from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Crosshair } from "lucide-react";

type DirectionalSnappingPadProps = {
  onSnap: (direction: "up" | "down" | "left" | "right") => void;
};

export function DirectionalSnappingPad({ onSnap }: DirectionalSnappingPadProps) {
  return (
    <div className="rounded-lg bg-black/85 border border-orange-500/40 p-3 shadow-lg text-white flex flex-col items-center justify-center">
      <span className="text-[10px] font-black uppercase text-orange-400 tracking-wider mb-2 flex items-center gap-1">
        <Crosshair className="h-3.5 w-3.5" /> Viewport Snapping D-Pad
      </span>

      <div className="grid grid-cols-3 gap-1.5 w-36">
        <div />
        <button
          type="button"
          onClick={() => onSnap("up")}
          className="h-9 w-11 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition-all"
          title="Snap Up (W / ↑)"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <div />

        <button
          type="button"
          onClick={() => onSnap("left")}
          className="h-9 w-11 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition-all"
          title="Snap Left (A / ←)"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-9 w-11 rounded-md bg-[#181a1e] border border-orange-500/50 flex items-center justify-center text-[9px] font-black text-orange-400 font-mono select-none">
          SNAP
        </div>
        <button
          type="button"
          onClick={() => onSnap("right")}
          className="h-9 w-11 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition-all"
          title="Snap Right (D / →)"
        >
          <ArrowRight className="h-4 w-4" />
        </button>

        <div />
        <button
          type="button"
          onClick={() => onSnap("down")}
          className="h-9 w-11 rounded-md bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition-all"
          title="Snap Down (S / ↓)"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
        <div />
      </div>

      <div className="mt-2 text-[10px] text-slate-400 font-mono">
        Keys: <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">WASD</kbd> or <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">ARROWS</kbd>
      </div>
    </div>
  );
}
export default DirectionalSnappingPad;
