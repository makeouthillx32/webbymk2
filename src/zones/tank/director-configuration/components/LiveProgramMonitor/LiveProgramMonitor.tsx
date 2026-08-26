"use client";

import React from "react";
import { Tv, Volume2, Activity, ShieldCheck } from "lucide-react";
import type { DirectorViewportState, CameraTileBounds } from "../../../server/directorVirtualAtlas";
import type { DiscoveredCamera } from "../../../contracts";
import { CameraPlayer } from "../../../public/CameraPlayer";

type LiveProgramMonitorProps = {
  directorState: DirectorViewportState;
  activeTile: CameraTileBounds;
  activeLiveCam?: DiscoveredCamera;
};

export function LiveProgramMonitor({
  directorState,
  activeTile,
  activeLiveCam,
}: LiveProgramMonitorProps) {
  const online =
    activeLiveCam?.presence === "online" ||
    activeLiveCam?.presence === "degraded" ||
    activeLiveCam?.playbackStatus === "ready";

  return (
    <div className="rounded-xl border border-orange-500/40 bg-black/90 p-4 text-white shadow-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-orange-600 text-white shadow">
            <Tv className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              Program Live Output (Clean Feed)
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Atlas Ingest &rarr; Public Stream Relay (Unmodified Video Out)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
            <ShieldCheck className="h-3 w-3" />
            CLEAN PASS-THROUGH
          </span>
          <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            ON AIR
          </span>
        </div>
      </div>

      {/* Program Screen Real Live Video Feed — 100% Clean Pass-Through */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/20 shadow-inner">
        <CameraPlayer
          online={online}
          playbackUrl={activeLiveCam?.playbackUrl ?? null}
          playbackProtocol={activeLiveCam?.playbackProtocol ?? "whep"}
          cameraLabel={`Program: ${activeTile.cameraName}`}
          showStats={false}
        />

        {/* Subtle Broadcast Corner Header (Program Ingest Verification) */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[9px] font-mono z-10 pointer-events-none">
          <span className="rounded bg-black/80 px-2 py-0.5 text-orange-400 border border-orange-500/40">
            ACTIVE FEED: {activeTile.cameraName.toUpperCase()}
          </span>
          <span className="rounded bg-black/80 px-2 py-0.5 text-emerald-400 border border-emerald-500/40">
            {activeLiveCam?.deliveryKind?.toUpperCase() || "WHEP"} · 60 FPS
          </span>
        </div>
      </div>

      {/* Broadcast Telemetry Grid */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono bg-[#16181c] p-2.5 rounded-lg border border-white/10">
        <div>
          <span className="text-slate-500 block uppercase">Director Mode</span>
          <span className="text-orange-400 font-black uppercase">{directorState.subjectMode}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase">Delegation Target</span>
          <span className="text-blue-400 font-black uppercase">{activeTile.cameraName}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase">Video Integrity</span>
          <span className="text-emerald-400 font-black uppercase">100% UNTOUCHED</span>
        </div>
      </div>
    </div>
  );
}
export default LiveProgramMonitor;
