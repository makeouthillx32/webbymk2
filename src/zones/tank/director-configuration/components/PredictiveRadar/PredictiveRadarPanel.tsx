"use client";

import React from "react";
import { Radar, Lock, Unlock, Zap, Crosshair, Radio, Activity, Eye, ArrowRight } from "lucide-react";
import type { NextRoomPrediction, TrackingSpeed } from "../../../director/aiTrackingFraming";
import type { FramingMode } from "../../../server/directorVirtualAtlas";
import type { ActiveChaosItemPayload } from "../../../director/chaosDirectorCatalog";

type PredictiveRadarPanelProps = {
  prediction: NextRoomPrediction;
  onToggleRoomLock: () => void;
  activeRoomName: string;
  trackingSpeed: TrackingSpeed;
  framingMode: FramingMode;
  activeChaosItem?: ActiveChaosItemPayload | null;
};

export function PredictiveRadarPanel({
  prediction,
  onToggleRoomLock,
  activeRoomName,
  trackingSpeed,
  framingMode,
  activeChaosItem,
}: PredictiveRadarPanelProps) {
  const {
    activeScore,
    challengerRoomName,
    challengerScore,
    scoreDelta,
    switchThreshold,
    dwellRemainingMs,
    cutReadiness,
    willCut,
    predictedZoom,
    predictedFramingLabel,
    cutReason,
    isRoomLocked,
  } = prediction;

  const isLeading = scoreDelta >= switchThreshold;

  return (
    <div className="rounded-xl border border-black/80 bg-[#14151b] p-3.5 space-y-3 shadow-lg">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-orange-950/60 border border-orange-500/50 text-orange-400">
            <Radar className="h-4 w-4 animate-spin" style={{ animationDuration: "6s" }} />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
              Predictive AI Radar & Zoom Projector
            </p>
            <p className="text-[10px] font-mono text-slate-400">
              Anticipating next camera cuts & framing crops across real house feeds
            </p>
          </div>
        </div>

        {/* Room Lock Indicator Badge & Chaos Override Badge */}
        <div className="flex items-center gap-1.5">
          {activeChaosItem?.overrideRoomLock && (
            <span className="flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-red-500/20 border border-red-500 text-red-300 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]">
              <Zap className="h-3 w-3 text-red-400 fill-red-400" />
              OFF ROCKER (ITEM OVERRIDE)
            </span>
          )}

          <span
            className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
              isRoomLocked
                ? "bg-amber-500/20 border border-amber-500 text-amber-300"
                : "bg-emerald-500/20 border border-emerald-500/50 text-emerald-400"
            }`}
          >
            {isRoomLocked ? (
              <>
                <Lock className="h-3 w-3 text-amber-400" />
                LOCKED TO ROOM
              </>
            ) : (
              <>
                <Radio className="h-3 w-3 text-emerald-400 animate-pulse" />
                FOLLOW ACROSS ROOMS
              </>
            )}
          </span>
        </div>
      </div>

      {/* Primary Room Lock / Follow Across Rooms Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-black/40 border border-white/5">
        <div className="text-[10px] text-slate-300">
          {activeChaosItem?.overrideRoomLock ? (
            <p className="text-red-300">
              <strong className="text-red-400 font-mono">💥 KNOCKED OFF ROCKER:</strong>{" "}
              Active chaos item <strong className="text-white font-black">{activeChaosItem.itemName}</strong> is
              currently overriding operator room locks ({activeChaosItem.timeRemainingSeconds}s left).
            </p>
          ) : isRoomLocked ? (
            <p>
              <strong className="text-amber-400 font-mono">ROOM PINNED:</strong> AI Director will not
              cut away from <strong className="text-white">{activeRoomName}</strong>. AI PTZ stays
              actively framing subjects in this room.
            </p>
          ) : (
            <p>
              <strong className="text-emerald-400 font-mono">CROSS-ROOM FOLLOW:</strong> AI Director
              will autonomously cut rooms to follow subjects across cameras.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleRoomLock}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
            isRoomLocked
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-md ring-1 ring-emerald-400/50"
              : "bg-amber-600 hover:bg-amber-500 text-black font-black shadow-md ring-1 ring-amber-400/50"
          }`}
        >
          {isRoomLocked ? (
            <>
              <Unlock className="h-3.5 w-3.5" />
              Unlock: Follow Across Rooms
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5" />
              Lock To Current Room
            </>
          )}
        </button>
      </div>

      {/* Radar Matrix: Active vs Challenger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {/* Current Program Room Card */}
        <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Radio className="h-3 w-3 text-red-500 animate-pulse" /> ON AIR NOW
            </span>
            <span className="text-[10px] font-mono font-bold text-orange-400">
              {activeScore} pts
            </span>
          </div>
          <p className="text-sm font-black text-white truncate">{activeRoomName}</p>
          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
            <span>PTZ: Active In-Room</span>
            <span className="text-slate-300">
              {trackingSpeed === "sport" ? "Sport (2x faster glide)" : "Standard glide"}
            </span>
          </div>
        </div>

        {/* Challenger Candidate Card */}
        <div
          className={`rounded-lg border p-2.5 space-y-1.5 transition ${
            isLeading
              ? "border-amber-500/60 bg-amber-950/20"
              : "border-white/10 bg-black/30"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-slate-400 flex items-center gap-1">
              <Crosshair className="h-3 w-3 text-cyan-400" /> POTENTIAL NEXT ROOM
            </span>
            <span
              className={`text-[10px] font-mono font-bold ${
                scoreDelta > 0 ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              {challengerScore} pts ({scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta} pts)
            </span>
          </div>
          <p className="text-sm font-black text-white truncate">
            {challengerRoomName || "No Challenger"}
          </p>
          <div className="text-[10px] font-mono flex items-center justify-between text-slate-400">
            <span>Next Target Zoom:</span>
            <span className="text-cyan-300 font-bold">
              {predictedZoom.toFixed(1)}x · {predictedFramingLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Cut Readiness Progress Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-slate-400 flex items-center gap-1">
            <Activity className="h-3 w-3 text-orange-500" />
            Cut Readiness & Dwell Gate:
          </span>
          <span
            className={`font-black uppercase ${
              isRoomLocked
                ? "text-amber-400"
                : willCut
                ? "text-emerald-400 animate-pulse"
                : isLeading
                ? "text-yellow-400"
                : "text-slate-500"
            }`}
          >
            {isRoomLocked
              ? "LOCKED (CUTS SUPPRESSED)"
              : willCut
              ? "⚡ CUT IMMINENT"
              : isLeading
              ? `Holding: ${(dwellRemainingMs / 1000).toFixed(1)}s`
              : `Lead Deficit: ${Math.max(0, switchThreshold - scoreDelta)} pts`}
          </span>
        </div>

        <div className="h-2 w-full rounded-full bg-black/60 overflow-hidden border border-white/10 p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isRoomLocked
                ? "bg-amber-500"
                : willCut
                ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                : isLeading
                ? "bg-amber-400"
                : "bg-slate-700"
            }`}
            style={{ width: `${Math.round(cutReadiness * 100)}%` }}
          />
        </div>
      </div>

      {/* Live AI Trigger Rationale */}
      <div className="rounded border border-white/5 bg-black/20 px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-300">
        <span className="text-slate-400">AI Rationale:</span>
        <span className="text-orange-200 font-semibold truncate ml-2">{cutReason}</span>
      </div>
    </div>
  );
}

export default PredictiveRadarPanel;
