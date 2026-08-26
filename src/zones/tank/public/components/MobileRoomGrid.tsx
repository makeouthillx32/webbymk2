"use client";

import React from "react";
import { CameraPlayer } from "../CameraPlayer";
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
    <div className="w-full pb-20 duration-200 animate-in fade-in">
      {/* 2-Column Grid of Clean Camera Tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
        {/* 1. Director Tile */}
        <button
          type="button"
          onClick={onSelectDirector}
          aria-label="Open Director"
          className="hover:border-yellow-400/80 active:scale-98 group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-black/80 bg-[#121417] shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.02]"
        >
          {/* Top-left Title */}
          <div className="absolute left-2.5 top-2 z-20">
            <span
              className="text-xs font-black tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
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
              prerollLoopUrl={
                directorCamera?.recentClipUrl ?? null
              }
              muted
              className="h-full w-full object-cover"
            />
          </div>

          {/* Vignette */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

        </button>

        {/* 2. House Room Tiles */}
        {rooms.map((room) => {
          const hasFeed = Boolean(room.camera?.playbackUrl);
          const isOnline = Boolean(room.isOnline);

          return (
            <button
              key={room.roomKey}
              type="button"
              onClick={() => onSelectRoom(room.roomKey)}
              aria-label={`Open ${room.title}`}
              className="hover:border-yellow-400/80 active:scale-98 group relative aspect-video w-full cursor-pointer overflow-hidden rounded-xl border border-black/80 bg-[#121417] shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-all hover:scale-[1.02]"
            >
              {/* Top-left Room Name */}
              <div className="absolute left-2.5 top-2 z-20">
                <span
                  className="text-xs font-black tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
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
                  prerollLoopUrl={
                    room.camera?.recentClipUrl ?? null
                  }
                  muted
                  className="h-full w-full object-cover"
                />
              </div>

              {/* Vignette */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

            </button>
          );
        })}
      </div>
    </div>
  );
}
