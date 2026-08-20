"use client";

import React from "react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { CameraPlayer } from "../CameraPlayer";
import { getCameraLoopUrl } from "../../mediaPlayback";
import { ACTIVE_THEME } from "../../theme";
import type { DiscoveredCamera } from "../../contracts";

const LED_GREEN = "#39ff6a";
const LED_RED = "#ff3b2f";
const glow = (rgb: string) => ({ textShadow: `0 0 6px ${rgb}, 0 0 1px ${rgb}` });

export type CameraRosterItem = {
  roomKey: string;
  title: string;
  camera?: DiscoveredCamera;
  isOnline?: boolean;
};

export type CameraRosterPanelProps = {
  mode: "director" | "room" | "grid";
  onSetMode: (mode: "director" | "room") => void;
  anyHouseCameraOnline: boolean;
  onlineCameraCount: number;
  totalCameraCount: number;
  rooms: CameraRosterItem[];
  selectedRoomSlug: string | null;
  onSelectRoom: (roomKey: string) => void;
};

export function CameraRosterPanel({
  mode,
  onSetMode,
  anyHouseCameraOnline,
  onlineCameraCount,
  totalCameraCount,
  rooms,
  selectedRoomSlug,
  onSelectRoom,
}: CameraRosterPanelProps) {
  return (
    <ChromePanel
      withScrews
      className="w-full"
      contentClassName="!px-7 !py-4 space-y-3"
    >
      {/* Top Controls Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ConsoleButton
            variant={mode === "director" ? "orange" : "gray"}
            onClick={() => onSetMode("director")}
            className="shadow-sm"
          >
            Director
          </ConsoleButton>
          <ConsoleButton
            variant={mode === "room" ? "orange" : "gray"}
            onClick={() => onSetMode("room")}
            className="shadow-sm"
          >
            Free Roam
          </ConsoleButton>
        </div>

        {/* LED Camera Count Indicator */}
        <div className="flex items-center gap-2 rounded border border-black/50 bg-black/90 px-2.5 py-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.8)]">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              backgroundColor: anyHouseCameraOnline ? LED_GREEN : LED_RED,
              boxShadow: `0 0 6px ${anyHouseCameraOnline ? LED_GREEN : LED_RED}`,
            }}
          />
          <span
            className="text-[11px] font-black tracking-wider"
            style={{
              color: anyHouseCameraOnline ? LED_GREEN : LED_RED,
              fontFamily: ACTIVE_THEME.fonts.dotMatrix,
              ...glow(anyHouseCameraOnline ? "rgba(57,255,106,0.6)" : "rgba(255,59,47,0.6)"),
            }}
          >
            {onlineCameraCount}/{totalCameraCount} CAMS ONLINE
          </span>
        </div>
      </div>

      {/* Camera Grid Cards under Director */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => {
          const isSelected = mode === "room" && selectedRoomSlug === room.roomKey;
          const isOnline = Boolean(room.isOnline);
          const hasFeed = Boolean(room.camera?.playbackUrl);

          return (
            <button
              key={room.roomKey}
              type="button"
              onClick={() => onSelectRoom(room.roomKey)}
              className={`group relative flex aspect-video w-full flex-col overflow-hidden rounded-md border text-left transition-all ${
                isSelected
                  ? "border-[#4fd6ff] ring-2 ring-[#4fd6ff] shadow-[0_0_14px_rgba(79,214,255,0.6)]"
                  : "border-black/60 hover:border-white/40 shadow-lg"
              }`}
              style={{
                backgroundColor: "#0d0e10",
              }}
            >
              {/* Live Video Preview or Retro CRT fallback */}
              <div className="relative h-full w-full overflow-hidden bg-black flex items-center justify-center pointer-events-none">
                <CameraPlayer
                  priority="thumbnail"
                  playbackUrl={room.camera?.playbackUrl ?? null}
                  playbackProtocol={room.camera?.playbackProtocol ?? "none"}
                  online={isOnline && hasFeed}
                  // Recent clip stands in while this tile waits for a stream
                  // slot on a thin connection.
                  prerollLoopUrl={room.camera?.id ? getCameraLoopUrl(room.camera.id) : null}
                  muted={true}
                  className="h-full w-full object-cover pointer-events-none"
                />

                {/* Subtle Room Name in Top-Left Corner */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded bg-black/70 px-2 py-0.5 backdrop-blur-sm">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: isOnline && hasFeed ? LED_GREEN : LED_RED,
                      boxShadow: `0 0 4px ${isOnline && hasFeed ? LED_GREEN : LED_RED}`,
                    }}
                  />
                  <span
                    className={`text-[11px] font-black tracking-tight ${
                      isSelected ? "text-yellow-400" : "text-white"
                    }`}
                    style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                  >
                    {room.title}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ChromePanel>
  );
}
