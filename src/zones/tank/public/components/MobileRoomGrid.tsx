"use client";

import React from "react";
import { CameraPlayer } from "../CameraPlayer";
import { getCameraLoopUrl } from "../../mediaPlayback";
import type { DiscoveredCamera } from "../../contracts";
import { ACTIVE_THEME } from "../../theme";

export type RoomEntry = {
  roomKey: string;
  title: string;
  camera?: DiscoveredCamera;
  isOnline?: boolean;
};

export type MobileRoomGridProps = {
  rooms: RoomEntry[];
  directorCamera?: DiscoveredCamera;
  directorOnline?: boolean;
  onSelectDirector: () => void;
  onSelectRoom: (roomKey: string) => void;
};

export function MobileRoomGrid({
  rooms,
  directorCamera,
  directorOnline = false,
  onSelectDirector,
  onSelectRoom,
}: MobileRoomGridProps) {
  return (
    <div className="w-full pb-20 animate-in fade-in duration-200">
      {/* 2-Column Grid of Clean Camera Tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
        {/* 1. Director Tile */}
        <div
          onClick={onSelectDirector}
          className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-black/80 bg-[#121417] shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.02] hover:border-yellow-400/80 active:scale-98"
        >
          {/* Top-left Title */}
          <div className="absolute left-2.5 top-2 z-20">
            <span
              className="text-xs font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] tracking-wide"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Director
            </span>
          </div>

          {/* Video / Fallback */}
          <div className="absolute inset-0">
            <CameraPlayer
                  priority="thumbnail"
              playbackUrl={directorCamera?.playbackUrl ?? null}
              playbackProtocol={directorCamera?.playbackProtocol ?? "none"}
              online={directorOnline}
              // Shown when the tile is holding back on a thin connection: a
              // recent clip of this room beats a "saving data" card, and costs
              // one short cached file rather than an open live connection.
              prerollLoopUrl={directorCamera?.id ? getCameraLoopUrl(directorCamera.id) : null}
              muted
              className="h-full w-full object-cover"
            />
          </div>

          {/* Vignette */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
        </div>

        {/* 2. House Room Tiles */}
        {rooms.map((room) => {
          const hasFeed = Boolean(room.camera?.playbackUrl);
          const isOnline = Boolean(room.isOnline);

          return (
            <div
              key={room.roomKey}
              onClick={() => onSelectRoom(room.roomKey)}
              className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-black/80 bg-[#121417] shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.02] hover:border-yellow-400/80 active:scale-98"
            >
              {/* Top-left Room Name */}
              <div className="absolute left-2.5 top-2 z-20">
                <span
                  className="text-xs font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] tracking-wide"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  {room.title}
                </span>
              </div>

              {/* Video / Fallback */}
              <div className="absolute inset-0">
                <CameraPlayer
                  priority="thumbnail"
                  playbackUrl={room.camera?.playbackUrl ?? null}
                  playbackProtocol={room.camera?.playbackProtocol ?? "none"}
                  online={isOnline && hasFeed}
                  prerollLoopUrl={room.camera?.id ? getCameraLoopUrl(room.camera.id) : null}
                  muted
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Vignette */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
