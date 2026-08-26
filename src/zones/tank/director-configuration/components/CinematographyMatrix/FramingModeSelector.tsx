"use client";

import React from "react";
import { Video } from "lucide-react";
import type { FramingMode } from "../../../server/directorVirtualAtlas";

type FramingModeSelectorProps = {
  framingMode: FramingMode;
  onSelectFraming: (mode: FramingMode) => void;
};

const FRAMING_MODES: Array<{ id: FramingMode; label: string; desc: string }> = [
  { id: "camera", label: "Full Tile (Snap)", desc: "Locks to exact 3840x2160 tile bounds" },
  { id: "group", label: "Group Cluster", desc: "Dynamic crop around multi-subject centroid" },
  { id: "follow", label: "Virtual PTZ", desc: "Smooth pan-tilt following dominant subject" },
  { id: "close", label: "Tight Close-Up", desc: "High zoom crop centered on head/feet" },
];

export function FramingModeSelector({ framingMode, onSelectFraming }: FramingModeSelectorProps) {
  return (
    <div className="rounded-lg bg-black/5 p-3.5 border border-black/15 space-y-2.5">
      <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
        <Video className="h-4 w-4 text-blue-600" />
        Framing & Crop Geometry
      </p>

      <div className="grid grid-cols-2 gap-2">
        {FRAMING_MODES.map((f) => {
          const isSelected = framingMode === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelectFraming(f.id)}
              className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-600 text-white shadow-md"
                  : "border-black/15 bg-white/70 text-[#3a3528] hover:bg-white"
              }`}
            >
              <span className="text-xs font-black">{f.label}</span>
              <span className={`text-[9px] mt-0.5 ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
                {f.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export default FramingModeSelector;
