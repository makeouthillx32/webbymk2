"use client";

import React from "react";
import { Video } from "lucide-react";
import type {
  DynamicAtlasLayout,
  DirectorViewportState,
  CameraTelemetryInput,
  DetectionCategoryFilters,
} from "../../../server/directorVirtualAtlas";
import type { DiscoveredCamera } from "../../../contracts";
import { CameraPlayer } from "../../../public/CameraPlayer";
import { HoverViewportReticle } from "./HoverViewportReticle";
import { CanvasDetectionOverlay } from "./CanvasDetectionOverlay";

type VirtualCanvasProps = {
  atlasLayout: DynamicAtlasLayout;
  directorState: DirectorViewportState;
  inputs: CameraTelemetryInput[];
  liveById: Map<string, DiscoveredCamera>;
  showDetectionBoxes: boolean;
  filters?: DetectionCategoryFilters;
  overlayVisibility?: Partial<import("../../overlayRegistry").OverlayVisibility>;
  members?: import("../../../server/houseMembers").HouseMember[];
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
  onSelectCamera,
  onAdjustFeet,
  onAdjustAudio,
}: VirtualCanvasProps) {
  const currentActiveTile =
    atlasLayout.tiles.find((t) => t.cameraId === directorState.activeCameraId) ||
    atlasLayout.tiles[0];

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
          const online = liveCam?.presence === "online" || liveCam?.presence === "degraded" || liveCam?.playbackStatus === "ready";
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
              {/* Real Video Footage — fills the tile edge to edge, no rounding, no margin */}
              <CameraPlayer
                online={online}
                playbackUrl={liveCam?.playbackUrl ?? null}
                playbackProtocol={liveCam?.playbackProtocol ?? "whep"}
                cameraLabel={tile.cameraName}
                showStats={false}
                priority={isLead ? "hero" : "thumbnail"}
              />

              {/* Glowing Hover Viewport Reticle */}
              <HoverViewportReticle tile={tile} isLead={isLead} />

              {/* Tile Header — floats over the footage instead of pushing it down */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-2 py-1.5">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-black text-white">
                    {tile.cameraName}
                    {isLead && (
                      <span className="rounded bg-orange-500 px-1.5 py-0.2 text-[8px] font-black text-black">
                        PROGRAM LIVE ★
                      </span>
                    )}
                  </p>
                  <p className="text-[9px] font-mono text-slate-300">
                    [{tile.xMin}, {tile.yMin}] &rarr; [{tile.xMax}, {tile.yMax}] · {tile.kind.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black font-mono text-emerald-400">
                    {calcScore} pts
                  </span>
                </div>
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
          overlays={overlayVisibility}
          members={members}
          visible={showDetectionBoxes}
        />
      </div>
    </div>
  );
}
export default VirtualCanvas;
