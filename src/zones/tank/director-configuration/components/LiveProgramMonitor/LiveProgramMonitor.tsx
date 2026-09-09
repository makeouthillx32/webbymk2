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
  ptzState?: import("../NavigationController").VirtualPtzState;
};

export function LiveProgramMonitor({
  directorState,
  activeTile,
  activeLiveCam,
  ptzState,
}: LiveProgramMonitorProps) {
  const online =
    activeLiveCam?.presence === "online" ||
    activeLiveCam?.presence === "degraded";

  const zoom = ptzState?.zoomFactor || directorState.zoomFactor || 1;
  const panX = ptzState?.panOffsetX || 0;
  const panY = ptzState?.panOffsetY || 0;
  const cropW = Math.round(3840 / zoom);
  const cropH = Math.round(2160 / zoom);

  const tile = activeTile || {
    cameraId: directorState.activeCameraId || "cam-default",
    cameraName: "Main Feed",
    slug: "main",
    xMin: 0,
    yMin: 0,
    xMax: 3840,
    yMax: 2160,
    col: 0,
    row: 0,
    kind: "ipcam" as const,
    nativeResolution: { width: 3840, height: 2160 },
    unitSlot: { uX: 0, uY: 0, unitsWide: 4, unitsHigh: 4 },
    proxyXMin: 0,
    proxyYMin: 0,
  };

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
          <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[9px] font-black tracking-wider text-white animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            ON AIR
          </span>
        </div>
      </div>

      {/* Program Screen Real Live Video Feed — Zoomed & Cropped when PTZ active */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-black border border-white/20 shadow-inner">
        <div
          key={tile.cameraId}
          className="w-full h-full transition-transform duration-150 ease-out origin-top-left overflow-hidden animate-in fade-in-60 zoom-in-95 duration-200"
          style={
            zoom > 1
              ? {
                  transform: `scale(${zoom}) translate3d(-${(panX / 3840) * 100}%, -${(panY / 2160) * 100}%, 0)`,
                  transformOrigin: "0% 0%",
                  willChange: "transform",
                }
              : {
                  willChange: "transform",
                }
          }
        >
          <CameraPlayer
            online={online}
            playbackUrl={activeLiveCam?.playbackUrl ?? null}
            playbackProtocol={activeLiveCam?.playbackProtocol ?? "none"}
            priority="hero"
          />
        </div>

        {/* Subtle Broadcast Corner Header (Program Ingest Verification) */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[9px] font-mono z-10 pointer-events-none">
          <span className="rounded bg-black/80 px-2 py-0.5 text-orange-400 border border-orange-500/40">
            ACTIVE FEED: {tile.cameraName.toUpperCase()}
          </span>
          <span className={`rounded bg-black/80 px-2 py-0.5 border ${
            zoom > 1 ? "text-cyan-300 border-cyan-500/50 font-bold" : "text-emerald-400 border-emerald-500/40"
          }`}>
            {zoom > 1
              ? `${cropW}x${cropH} [${zoom.toFixed(2)}x PTZ]`
              : `${(activeLiveCam?.playbackProtocol || "none").toUpperCase()} · LIVE`}
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
          <span className="text-blue-400 font-black uppercase">{tile.cameraName}</span>
        </div>
        <div>
          <span className="text-slate-500 block uppercase">Video Output Frame</span>
          <span className={zoom > 1 ? "text-cyan-300 font-black uppercase" : "text-emerald-400 font-black uppercase"}>
            {zoom > 1 ? `${zoom.toFixed(2)}X PTZ CROP` : "100% FULL NATIVE"}
          </span>
        </div>
      </div>
    </div>
  );
}
export default LiveProgramMonitor;
