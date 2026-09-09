"use client";

import React from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Grid } from "lucide-react";

type DirectionalSnappingPadProps = {
  activeRoomKey?: string;
  activeCameraName?: string;
  onSnap: (direction: "up" | "down" | "left" | "right") => void;
  onOscEmit?: (address: string, args: (string | number)[]) => void;
};

export function DirectionalSnappingPad({
  activeRoomKey = "game-room",
  activeCameraName = "Current Camera",
  onSnap,
  onOscEmit,
}: DirectionalSnappingPadProps) {
  const handleSnap = (direction: "up" | "down" | "left" | "right") => {
    onSnap(direction);
    onOscEmit?.("/room/snap", [direction]);

    // Dispatch silent movement log
    void fetch("/api/tank/director/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entry: {
          eventType: "room_snap",
          operator: {
            user: "Tyler",
            connectionType: "browser_web",
          },
          source: {
            roomId: activeRoomKey,
            cameraName: activeCameraName,
            panX: 0,
            panY: 0,
            zoom: 1,
          },
          trajectory: {
            vx: direction === "right" ? 1 : direction === "left" ? -1 : 0,
            vy: direction === "down" ? 1 : direction === "up" ? -1 : 0,
            deltaX: 0,
            deltaY: 0,
            deltaZoom: 0,
            durationMs: 400,
            easingCurve: "matrix-move-cubic",
          },
        },
      }),
    }).catch(() => {});
  };

  return (
    <div className="w-full rounded-2xl bg-[#16181d] border border-white/10 p-4 shadow-2xl text-slate-100 flex flex-col items-center justify-between font-sans select-none max-w-sm">
      {/* ── TOP BAR: Matrix Snapper ── */}
      <div className="w-full flex items-center justify-between pb-1">
        <span className="text-sm font-semibold text-slate-200 tracking-wide flex items-center gap-1.5">
          <Grid className="h-4 w-4 text-[#ea1c3d]" /> Room Matrix Snapper
        </span>
        <span className="text-[10px] font-mono text-slate-400 bg-[#272a31] px-2 py-0.5 rounded border border-white/5">
          3×2 Canvas
        </span>
      </div>

      {/* ── D-PAD CROSSHAIR BUTTONS ── */}
      <div className="py-3">
        <div className="grid grid-cols-3 gap-2 w-40">
          <div />
          <button
            type="button"
            onClick={() => handleSnap("up")}
            className="h-11 rounded-xl bg-[#272a31] hover:bg-[#ea1c3d] text-slate-200 hover:text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition-all border border-white/5 group"
            title="Snap Room Up (W / ↑)"
          >
            <ArrowUp className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>
          <div />

          <button
            type="button"
            onClick={() => handleSnap("left")}
            className="h-11 rounded-xl bg-[#272a31] hover:bg-[#ea1c3d] text-slate-200 hover:text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition-all border border-white/5 group"
            title="Snap Room Left (A / ←)"
          >
            <ArrowLeft className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>

          <div className="h-11 rounded-xl bg-[#1e222a] border border-[#2b303b] flex items-center justify-center text-[10px] font-black text-slate-400 font-mono select-none">
            ROOM
          </div>

          <button
            type="button"
            onClick={() => handleSnap("right")}
            className="h-11 rounded-xl bg-[#272a31] hover:bg-[#ea1c3d] text-slate-200 hover:text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition-all border border-white/5 group"
            title="Snap Room Right (D / →)"
          >
            <ArrowRight className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>

          <div />
          <button
            type="button"
            onClick={() => handleSnap("down")}
            className="h-11 rounded-xl bg-[#272a31] hover:bg-[#ea1c3d] text-slate-200 hover:text-white font-bold flex items-center justify-center shadow-md active:scale-95 transition-all border border-white/5 group"
            title="Snap Room Down (S / ↓)"
          >
            <ArrowDown className="h-5 w-5 group-hover:scale-110 transition-transform" />
          </button>
          <div />
        </div>
      </div>

      {/* ── KEYBOARD HINT FOOTER ── */}
      <div className="w-full text-center pt-2 border-t border-white/5 text-[10px] text-slate-400 font-mono">
        Jump rooms with <kbd className="px-1.5 py-0.5 rounded bg-[#272a31] text-slate-200 border border-white/5 font-bold">WASD</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-[#272a31] text-slate-200 border border-white/5 font-bold">ARROWS</kbd>
      </div>
    </div>
  );
}
export default DirectionalSnappingPad;
