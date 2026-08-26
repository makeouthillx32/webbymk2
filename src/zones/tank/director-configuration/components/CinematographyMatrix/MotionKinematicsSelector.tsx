"use client";

import React from "react";
import { Zap } from "lucide-react";
import type { MotionCurve } from "../../../server/directorVirtualAtlas";

type MotionKinematicsSelectorProps = {
  motionCurve: MotionCurve;
  onSelectCurve: (curve: MotionCurve) => void;
};

export function MotionKinematicsSelector({
  motionCurve,
  onSelectCurve,
}: MotionKinematicsSelectorProps) {
  return (
    <div className="rounded-lg bg-black/5 p-3.5 border border-black/15 space-y-2.5">
      <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
        <Zap className="h-4 w-4 text-amber-600" />
        Kinematics & Transition Curve
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSelectCurve("snap")}
          className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
            motionCurve === "snap"
              ? "border-amber-500 bg-amber-600 text-white shadow-md"
              : "border-black/15 bg-white/70 text-[#3a3528] hover:bg-white"
          }`}
        >
          <span className="text-xs font-black">Instant Cut (0ms)</span>
          <span className={`text-[9px] mt-0.5 ${motionCurve === "snap" ? "text-amber-100" : "text-slate-500"}`}>
            Immediate frame snap without panning
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectCurve("track")}
          className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
            motionCurve === "track"
              ? "border-amber-500 bg-amber-600 text-white shadow-md"
              : "border-black/15 bg-white/70 text-[#3a3528] hover:bg-white"
          }`}
        >
          <span className="text-xs font-black">Smoothed Virtual PTZ</span>
          <span className={`text-[9px] mt-0.5 ${motionCurve === "track" ? "text-amber-100" : "text-slate-500"}`}>
            Fluid easing across virtual canvas coordinates
          </span>
        </button>
      </div>
    </div>
  );
}
export default MotionKinematicsSelector;
