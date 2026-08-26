"use client";

import React from "react";
import { Tv, Radio, Sparkles, Activity, ShieldAlert, Clock } from "lucide-react";
import { ACTIVE_THEME } from "../../theme";

export type DirectorModeOverlayProps = {
  mode: "STANDBY" | "AUDIO_TRACKING" | "ATTENTION_LOCKED" | "MANUAL_LOCK" | "NO_ROOMS";
  currentRoomTitle?: string;
  dwellSeconds?: number;
  maxDwellSeconds?: number;
  attentionLabel?: string;
  timeRemainingSeconds?: number | null;
  className?: string;
};

export function DirectorModeOverlay({
  mode,
  currentRoomTitle,
  dwellSeconds = 0,
  maxDwellSeconds = 15,
  attentionLabel,
  timeRemainingSeconds,
  className = "",
}: DirectorModeOverlayProps) {
  const isAttention = mode === "ATTENTION_LOCKED";
  const isStandby = mode === "STANDBY";
  const isAudioTracking = mode === "AUDIO_TRACKING";

  return (
    <div
      className={`pointer-events-none absolute top-3 left-3 right-3 z-30 flex items-center justify-between transition-all duration-300 ${className}`}
    >
      {/* Mode Badge with Glow Pill */}
      <div
        className="flex items-center gap-2 rounded-full border border-black/40 bg-black/60 px-3 py-1 text-white shadow-lg backdrop-blur-md"
        style={{ fontFamily: ACTIVE_THEME.fonts.label }}
      >
        <span
          className={`h-2 w-2 rounded-full animate-pulse shrink-0 ${
            isAttention
              ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
              : isAudioTracking
              ? "bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)]"
              : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]"
          }`}
        />
        <span className="text-[10px] font-black uppercase tracking-wider">
          {isAttention
            ? "ATTENTION LOCK"
            : isAudioTracking
            ? "AUDIO TRACKING"
            : "DIRECTOR STANDBY"}
        </span>
        {currentRoomTitle && (
          <span className="text-[10px] text-slate-300 font-bold">
            · {currentRoomTitle}
          </span>
        )}
      </div>

      {/* Timer / Attention Pill */}
      {isAttention && attentionLabel ? (
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/80 px-2.5 py-0.5 text-[10px] font-bold text-amber-300 shadow">
          <Clock className="h-3 w-3" />
          <span>{attentionLabel}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-full border border-white/20 bg-black/50 px-2.5 py-0.5 text-[10px] font-mono text-slate-300">
          <span>{dwellSeconds}s</span>
          <span className="text-slate-500">/</span>
          <span>{maxDwellSeconds}s</span>
        </div>
      )}
    </div>
  );
}

export default DirectorModeOverlay;
