"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Video } from "lucide-react";
import type {
  DynamicAtlasLayout,
  DirectorViewportState,
  CameraTelemetryInput,
  DetectionCategoryFilters,
} from "../../../server/directorVirtualAtlas";
import type { DiscoveredCamera } from "../../../contracts";
import { CameraPlayer, type CameraPlayerHandle } from "../../../public/CameraPlayer";
import { registerLiveVideo, unregisterLiveVideo } from "../../liveFrameRegistry";
import { HoverViewportReticle } from "./HoverViewportReticle";
import { CanvasDetectionOverlay } from "./CanvasDetectionOverlay";
import { CLASS_COLORS } from "../../detectionTheme";
import { deriveDirectorHlsUrl } from "../../../obs/directorPlayback";

type VirtualCanvasProps = {
  atlasLayout: DynamicAtlasLayout;
  directorState: DirectorViewportState;
  inputs: CameraTelemetryInput[];
  liveById: Map<string, DiscoveredCamera>;
  showDetectionBoxes: boolean;
  filters?: DetectionCategoryFilters;
  overlayVisibility?: Partial<import("../../overlayRegistry").OverlayVisibility>;
  members?: import("../../../server/houseMembers").HouseMember[];
  ptzState?: import("../NavigationController").VirtualPtzState;
  onSelectCamera: (cameraId: string, slug: string, xMin: number, yMin: number) => void;
  onAdjustFeet: (cameraId: string, delta: number) => void;
  onAdjustAudio: (cameraId: string, delta: number) => void;
};

export function VirtualCanvas({
  atlasLayout,
  directorState,
  inputs,
  liveById,
  showDetectionBoxes,
  filters,
  overlayVisibility,
  members,
  ptzState,
  onSelectCamera,
  onAdjustFeet,
  onAdjustAudio,
}: VirtualCanvasProps) {
  // Reachable now that DirectorWorkspace filters realCameras to online/
  // degraded only — every camera could legitimately be offline at once.
  if (atlasLayout.tiles.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
          <Video className="h-4 w-4 text-orange-600" />
          Real Footage Virtual Matrix
        </p>
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-[#241f14]/30 bg-black/5 text-sm font-bold text-[#4c4630]">
          No cameras are currently live — the matrix reappears the moment a room comes back online.
        </div>
      </div>
    );
  }

  const currentActiveTile =
    atlasLayout.tiles.find((t) => t.cameraId === directorState.activeCameraId) ||
    atlasLayout.tiles[0] || {
      cameraId: directorState.activeCameraId || "cam-default",
      cameraName: "Main Feed",
      slug: "main",
      col: 0,
      row: 0,
      xMin: 0,
      yMin: 0,
      xMax: 3840,
      yMax: 2160,
      kind: "ipcam" as const,
      nativeResolution: { width: 3840, height: 2160 },
      unitSlot: { uX: 0, uY: 0, unitsWide: 4, unitsHigh: 4 },
      proxyXMin: 0,
      proxyYMin: 0,
    };

  const gridColsClass =
    atlasLayout.grid.cols === 1
      ? "grid-cols-1"
      : atlasLayout.grid.cols === 2
      ? "grid-cols-2"
      : atlasLayout.grid.cols === 3
      ? "grid-cols-3"
      : atlasLayout.grid.cols === 4
      ? "grid-cols-4"
      : "grid-cols-5";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
          <Video className="h-4 w-4 text-orange-600" />
          Real Footage Virtual Matrix ({atlasLayout.grid.cols}x{atlasLayout.grid.rows} Grid · All Feeds Side-by-Side)
        </p>
        <span className="text-[10px] font-mono text-emerald-800 font-bold bg-emerald-100 px-2.5 py-0.5 rounded border border-emerald-300">
          Program Snap: Col {currentActiveTile.col + 1}/{atlasLayout.grid.cols}, Row {currentActiveTile.row + 1}/{atlasLayout.grid.rows} ({currentActiveTile.cameraName})
        </span>
      </div>

      {/* Class-color legend — standard in every real detection tool
          (Roboflow, CVAT, Ultralytics' own viewers all ship one): the box
          colors carry no meaning unless the operator can look them up. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-[#4c4630]">
        {Object.values(CLASS_COLORS).map((c) => (
          <span key={c.label} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: c.border }} />
            {c.label}
          </span>
        ))}
      </div>

      {/* Grid Matrix Container — the video wall.
          gap-0 and sharp corners on every layer (tile, video box) are load-bearing:
          the footage from adjacent cameras must butt up into one seamless block,
          the way a real security monitor bank looks, not a grid of floating cards.
          Header info and the feet/audio adjusters used to be stacked above/below
          the video inside padding, which pushed the footage inward and created a
          gap even after gap-3 and the rounding were removed — so they are now
          absolute overlays on top of the footage instead of rows around it. */}
      <div className={`relative grid gap-0 ${gridColsClass}`}>
        {atlasLayout.tiles.map((tile) => {
          const inp = inputs.find((i) => i.cameraId === tile.cameraId);
          const liveCam = liveById.get(tile.cameraId);
          const online = liveCam?.presence === "online" || liveCam?.presence === "degraded";
          const isLead = directorState.activeCameraId === tile.cameraId;
          const isChallenger = directorState.challengerId === tile.cameraId;
          const calcScore =
            directorState.scores.find((s) => s.tile.cameraId === tile.cameraId)?.score || 0;

          return (
            <div
              key={tile.cameraId}
              onClick={() => onSelectCamera(tile.cameraId, tile.slug, tile.xMin, tile.yMin)}
              className={`relative aspect-video w-full cursor-pointer overflow-hidden bg-black transition-all ${
                isLead
                  ? "ring-2 ring-inset ring-orange-500 shadow-[inset_0_0_25px_rgba(249,115,22,0.5)]"
                  : isChallenger
                  ? "ring-2 ring-inset ring-yellow-400 shadow-[inset_0_0_12px_rgba(234,179,8,0.4)]"
                  : "hover:ring-1 hover:ring-inset hover:ring-orange-500/50"
              }`}
            >
              {/* Real Video Footage (Full Canvas View) */}
              <MatrixTilePlayer
                cameraId={tile.cameraId}
                online={online}
                playbackUrl={liveCam?.playbackUrl ?? null}
                playbackProtocol={liveCam?.playbackProtocol ?? "none"}
                priority={isLead ? "hero" : "thumbnail"}
              />

              {/* Tile ID tag — a corner label, not a header bar. Went smaller
                  a second time tonight: the first pass (a full-width
                  gradient strip with name + points) was still reading as
                  "this screen tells you room names" when the actual point
                  of this screen is the detection overlay. No background
                  strip anymore, no full tile width claimed — just a small
                  tag tucked in the corner, text-shadow instead of a filled
                  bar so it doesn't compete with tracking boxes drawn on top
                  of it. Score dropped from its own always-visible slot to a
                  parenthetical on the SAME tag — it's diagnostic for
                  whoever's tuning the scorer, not something every viewer
                  needs a dedicated corner of the tile for. */}
              <div className="pointer-events-none absolute left-1 top-1 z-10 flex items-center gap-1 text-[9px] font-bold text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]">
                <span>{tile.cameraName}</span>
                {isLead && (
                  <span className="rounded bg-orange-500/90 px-1 py-0 text-[7px] font-black text-black">
                    LIVE
                  </span>
                )}
                <span className="font-mono text-white/50">({calcScore})</span>
              </div>
            </div>
          );
        })}

        {/* ONE detection layer for the whole wall. The wall is already
            seamless — gap-0, no rounding, every tile the same aspect — so a
            single absolutely-positioned overlay sees the exact rendered
            rectangle of the full multi-camera canvas, and every box is placed
            using the tile's real xMin/yMin offset into that canvas rather than
            being drawn independently six times. */}
        <CanvasDetectionOverlay
          atlasLayout={atlasLayout}
          inputs={inputs}
          filters={filters}
          overlays={overlayVisibility}
          members={members}
          visible={showDetectionBoxes}
        />

        {/* ── OBS-STYLE MOVE TRANSITION MATRIX RETICLE ──
            Glides smoothly across room tiles and coordinates on the video wall */}
        {(() => {
          const colWidthPct = 100 / atlasLayout.grid.cols;
          const rowHeightPct = 100 / atlasLayout.grid.rows;
          const activeCol = currentActiveTile.col;
          const activeRow = currentActiveTile.row;

          const zoom = ptzState?.zoomFactor && ptzState.zoomFactor > 1 ? ptzState.zoomFactor : 1;
          const panX = ptzState?.panOffsetX ?? 0;
          const panY = ptzState?.panOffsetY ?? 0;

          const widthPct = colWidthPct / zoom;
          const heightPct = rowHeightPct / zoom;
          const leftPct = activeCol * colWidthPct + (panX / 3840) * colWidthPct;
          const topPct = activeRow * rowHeightPct + (panY / 2160) * rowHeightPct;

          const currentX = currentActiveTile.xMin + panX;
          const currentY = currentActiveTile.yMin + panY;
          const currentW = Math.round(3840 / zoom);
          const currentH = Math.round(2160 / zoom);

          return (
            <div
              className="pointer-events-none absolute z-30 border-2 border-orange-500 bg-orange-500/15 shadow-[0_0_24px_rgba(249,115,22,0.6)] flex flex-col justify-between p-1.5"
              style={{
                width: `${widthPct}%`,
                height: `${heightPct}%`,
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transition: "all 400ms cubic-bezier(0.22, 1, 0.36, 1)",
                willChange: "left, top, width, height",
              }}
            >
              {/* Top Banner Tag */}
              <div className="flex items-center justify-between text-[7px] md:text-[8px] font-black uppercase text-orange-400 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/50 shadow">
                <span className="flex items-center gap-1 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
                  {currentActiveTile.cameraName} {zoom > 1 ? `(${zoom.toFixed(2)}x PTZ)` : ""}
                </span>
                <span className="font-mono text-emerald-400">PROGRAM ON AIR</span>
              </div>

              {/* Bottom Coordinates & Effective Resolution */}
              <div className="flex items-center justify-between text-[7px] md:text-[8px] font-mono text-orange-300 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/50 shadow">
                <span>
                  Pos: [{currentX}, {currentY}]
                </span>
                <span className={zoom > 1 ? "text-cyan-300 font-bold" : "text-slate-300"}>
                  {currentW}×{currentH}
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
export default VirtualCanvas;

/**
 * One matrix tile's player, which also publishes its decoded frames.
 *
 * Split out purely so each tile can own a ref and an effect — hooks cannot run
 * inside the tiles.map() callback above. Registering here is what lets
 * PeopleDetectionEngine sample the footage this tile is already decoding
 * instead of opening a second stream for the same camera.
 */
function MatrixTilePlayer({
  cameraId,
  online,
  playbackUrl,
  playbackProtocol,
  priority,
}: {
  cameraId: string;
  online: boolean;
  playbackUrl: string | null;
  playbackProtocol: string;
  priority: "hero" | "thumbnail";
}) {
  const handleRef = useRef<CameraPlayerHandle | null>(null);

  // A thumbnail tile takes the CHEAP rung, not merely a later turn at the
  // expensive one.
  //
  // `priority` already staggered connections and gated admission, but every
  // tile still received the 4K WHEP url — so this wall opened six 3840x2160
  // WebRTC decoders in one tab and then wondered why none of them produced a
  // picture. Measured on the programme source alone: 16% of frames dropped
  // with zero corrupted frames, which is starvation, not bad data.
  //
  // 720p HLS costs a fraction of that and is the right trade for a preview
  // tile: nobody directs off a 200px thumbnail's latency. The lead tile keeps
  // WHEP so the shot being judged stays live and full quality.
  const lowRungUrl = useMemo(() => {
    if (priority === "hero" || !playbackUrl) return null;
    const hls = deriveDirectorHlsUrl(playbackUrl);
    if (!hls) return null;
    // Hand over the FULL rung and let CameraPlayer pick the rung for the
    // priority it was given. This used to downgrade here, gated on
    // NEXT_PUBLIC_TANK_HLS_LOW_RUNG — a variable defined nowhere, so the gate
    // was always false and the "cheap rung" this comment promises was never
    // actually taken. Rung selection now lives in one place (see
    // effectiveQuality in CameraPlayer) and is driven by the server flag that
    // decides whether the rung exists at all.
    return hls;
  }, [priority, playbackUrl]);

  const effectiveUrl = lowRungUrl ?? playbackUrl;
  const effectiveProtocol = lowRungUrl ? "hls" : playbackProtocol;

  useEffect(() => {
    const getter = () => handleRef.current?.getActiveVideo() ?? null;
    registerLiveVideo(cameraId, getter);
    return () => unregisterLiveVideo(cameraId, getter);
  }, [cameraId]);

  return (
    <CameraPlayer
      ref={handleRef}
      online={online}
      playbackUrl={effectiveUrl}
      playbackProtocol={effectiveProtocol as never}
      priority={priority}
      // Monitoring surface: steadier buffer, and no spinner over the frame
      // the operator is judging and the detector is sampling.
      directorSurface
    />
  );
}
