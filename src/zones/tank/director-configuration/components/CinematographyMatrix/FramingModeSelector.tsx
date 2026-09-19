"use client";

import React from "react";
import { Video, Zap, Activity, Waves } from "lucide-react";
import type { FramingMode } from "../../../server/directorVirtualAtlas";
import { GIMBAL_SMOOTHNESS_MAX, GIMBAL_SMOOTHNESS_MIN, smoothnessToSeconds } from "../../../director/gimbal";

type FramingModeSelectorProps = {
  framingMode: FramingMode;
  onSelectFraming: (mode: FramingMode) => void;
  speedMode?: "fine" | "sport";
  onSelectSpeed?: (speed: "fine" | "sport") => void;
  /** Gimbal smoothness 1-10: slow start and slow stop on every crop move. */
  smoothness?: number;
  onSmoothnessChange?: (level: number) => void;
};

const FRAMING_MODES: Array<{ id: FramingMode; label: string; desc: string; badge: string }> = [
  { id: "normal", label: "Normal Tracking", desc: "Full-body composition centered on active subject", badge: "FULL BODY" },
  { id: "upper_body", label: "Upper Body", desc: "Waist-up framing: head, shoulders, and chest", badge: "BUST / 2.0x" },
  { id: "close_up", label: "Close-up", desc: "Tight facial & head framing with high-detail zoom", badge: "FACE / 3.0x" },
  { id: "headless", label: "Headless", desc: "Waist-down crop focusing on feet, shoes & ground", badge: "FEET / SHOES" },
  { id: "lower_body", label: "Lower Body", desc: "Focused shins, sneakers, and floor level", badge: "FLOOR LEVEL" },
  { id: "zone", label: "Zone Tracking", desc: "Locks framing within focal room sub-zone boundaries", badge: "SUB-ZONE" },
  { id: "group", label: "Group Cluster", desc: "Compound centroid enclosing all detected people", badge: "MULTI-BODY" },
  { id: "camera", label: "Full Camera", desc: "Native 1.0x wide-angle uncropped camera feed", badge: "100% WIDE" },
];

export function FramingModeSelector({
  framingMode,
  onSelectFraming,
  speedMode = "fine",
  onSelectSpeed,
  smoothness,
  onSmoothnessChange,
}: FramingModeSelectorProps) {
  return (
    <div className="rounded-lg bg-black/5 p-3.5 border border-black/15 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
          <Video className="h-4 w-4 text-blue-600" />
          AI Tracking Mode & Framing Geometry
        </p>

        {/* Tracking Speed Toggle: Standard vs Sport */}
        {onSelectSpeed && (
          <div className="flex items-center gap-1 bg-black/10 rounded-md p-0.5 border border-black/10">
            <span className="text-[9px] font-mono font-bold uppercase text-slate-600 px-1.5 flex items-center gap-1">
              <Activity className="h-2.5 w-2.5" /> SPEED:
            </span>
            <button
              type="button"
              onClick={() => onSelectSpeed("fine")}
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition ${
                speedMode !== "sport"
                  ? "bg-white text-blue-700 shadow-sm font-black"
                  : "text-slate-600 hover:text-black"
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => onSelectSpeed("sport")}
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase transition flex items-center gap-1 ${
                speedMode === "sport"
                  ? "bg-amber-500 text-black shadow-sm font-black"
                  : "text-slate-600 hover:text-black"
              }`}
            >
              <Zap className="h-2.5 w-2.5" /> Sport
            </button>
          </div>
        )}
      </div>

      {onSmoothnessChange && smoothness !== undefined && (
        <label htmlFor="gimbal-smoothness" className="flex items-center gap-2 rounded-md bg-black/10 border border-black/10 px-2 py-1">
          <span className="text-[9px] font-mono font-bold uppercase text-slate-600 flex items-center gap-1 whitespace-nowrap">
            <Waves className="h-2.5 w-2.5" /> Gimbal smoothness
          </span>
          <input
            id="gimbal-smoothness"
            type="range"
            min={GIMBAL_SMOOTHNESS_MIN}
            max={GIMBAL_SMOOTHNESS_MAX}
            step={1}
            value={smoothness}
            onChange={(e) => onSmoothnessChange(Number(e.target.value))}
            className="flex-1 accent-blue-600"
          />
          <span className="text-[10px] font-mono font-black text-[#241f14] tabular-nums whitespace-nowrap">
            {smoothness} · {smoothnessToSeconds(smoothness, speedMode === "sport" ? "sport" : "standard").toFixed(1)}s
          </span>
        </label>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FRAMING_MODES.map((f) => {
          const isSelected = framingMode === f.id || (f.id === "normal" && framingMode === "follow") || (f.id === "close_up" && framingMode === "close") || (f.id === "camera" && framingMode === "wide");
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelectFraming(f.id)}
              className={`flex flex-col items-start p-2 rounded-lg border text-left transition-all relative ${
                isSelected
                  ? "border-blue-500 bg-blue-600 text-white shadow-md ring-2 ring-blue-400/40"
                  : "border-black/15 bg-white/70 text-[#3a3528] hover:bg-white"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xs font-black leading-tight">{f.label}</span>
                <span
                  className={`text-[8px] font-mono uppercase font-black px-1 rounded ${
                    isSelected ? "bg-blue-800 text-blue-200" : "bg-black/5 text-slate-500"
                  }`}
                >
                  {f.badge}
                </span>
              </div>
              <span className={`text-[9px] mt-1 leading-tight line-clamp-2 ${isSelected ? "text-blue-100" : "text-slate-500"}`}>
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
