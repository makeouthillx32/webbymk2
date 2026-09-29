"use client";

import React, { useEffect, useState } from "react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { CameraPlayer } from "../CameraPlayer";
import { ACTIVE_THEME } from "../../theme";
import type { DiscoveredCamera } from "../../contracts";
import { RoomTileCrtHover } from "./RoomTileCrtHover";

const LED_GREEN = "#39ff6a";
const LED_RED = "#ff3b2f";

function RetryingLoopPreview({ url, online }: { url: string; online: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [url, online]);

  useEffect(() => {
    if (!failed || !online) return;
    // A loop may not exist on the first request (new/reconnected camera), and
    // Supabase Storage keeps the same public URL after the refresher uploads
    // it. Retry with a cache-buster instead of leaving the card hidden until a
    // full browser reload.
    const timer = window.setTimeout(() => {
      setAttempt((value) => value + 1);
      setFailed(false);
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [failed, online]);

  const separator = url.includes("?") ? "&" : "?";
  const src = attempt === 0 ? url : `${url}${separator}previewAttempt=${attempt}`;

  return (
    <video
      key={src}
      src={src}
      className={`h-full w-full object-cover transition-opacity ${failed ? "opacity-0" : "opacity-100"}`}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      onCanPlay={() => setFailed(false)}
      onError={() => setFailed(true)}
    />
  );
}
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
  directorCamera?: DiscoveredCamera;
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
  directorCamera,
  anyHouseCameraOnline,
  onlineCameraCount,
  totalCameraCount,
  rooms,
  selectedRoomSlug,
  onSelectRoom,
}: CameraRosterPanelProps) {
  const rosterItems = [
    {
      roomKey: "__director__",
      title: "Director",
      camera: directorCamera,
      isOnline: anyHouseCameraOnline,
      isDirector: true,
    },
    ...rooms.map((room) => ({ ...room, isDirector: false })),
  ];

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

      {/* All Rooms matrix. Director is a first-class destination beside the
          physical rooms, matching the mobile browser and reference layout. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
        {rosterItems.map((room) => {
          const isSelected = room.isDirector
            ? mode === "director"
            : mode === "room" && selectedRoomSlug === room.roomKey;
          const isOnline = Boolean(room.isOnline);
          const directorPreviewUrl = room.isDirector
            ? (room.camera?.previewUrl ?? room.camera?.playbackUrl ?? null)
            : null;
          const directorPreviewProtocol = room.camera?.previewUrl
            ? (room.camera.previewProtocol ?? "hls")
            : (room.camera?.playbackProtocol ?? "none");
          const hasFeed = Boolean(
            room.isDirector ? directorPreviewUrl : room.camera?.playbackUrl,
          );
          const loopUrl = room.camera?.recentClipUrl ?? null;
          const usesLivePreviewRung =
            room.camera?.protocol === "rtmp" ||
            room.camera?.protocol === "srtla" ||
            room.camera?.tags?.includes("obs") === true ||
            room.camera?.tags?.includes("mobile") === true;
          const previewUrl = room.camera?.previewUrl ?? null;

          return (
            <button
              key={room.roomKey}
              type="button"
              data-tank-room-tile
              onClick={() =>
                room.isDirector
                  ? onSetMode("director")
                  : onSelectRoom(room.roomKey)
              }
              aria-label={
                room.isDirector ? "Open Director" : `Open ${room.title}`
              }
              className={`group relative flex aspect-video w-full flex-col overflow-hidden text-left transition-all border ${
                isSelected
                  ? "border-[#4fd6ff] ring-2 ring-[#4fd6ff] shadow-[0_0_14px_rgba(79,214,255,0.6)]"
                  : "border-black/60 hover:border-white/40 shadow-lg"
              }`}
              style={{
                backgroundColor: "var(--tank-color-dark, #0d0e10)",
                borderRadius: "var(--tank-border-radius, 0.375rem)",
                borderColor: isSelected ? "var(--tank-color-link, #4fd6ff)" : undefined,
              }}
            >
              {/*
                Lightweight room preview. These cards used to mount one live
                WHEP/HLS player apiece, so the public page decoded six 4K house
                feeds plus OBS plus the hero simultaneously. Besides heating
                phones, that made a clicked room compete with its own thumbnail
                for ICE, bandwidth, and decode time. The roster now uses the
                existing recent-room loop while the one selected hero owns the
                real live connection. Director tooling has its own monitors and
                is not affected by this public-page budget.
              */}
              <div
                className={`relative h-full w-full overflow-hidden bg-gradient-to-br ${
                  room.camera?.accent ?? "from-slate-800 via-slate-950 to-black"
                } flex items-center justify-center pointer-events-none`}
              >
                {room.isDirector && hasFeed ? (
                  <CameraPlayer
                    key={room.camera?.id ?? room.roomKey}
                    priority="thumbnail"
                    playbackUrl={directorPreviewUrl}
                    playbackProtocol={directorPreviewProtocol}
                    online={isOnline}
                    prerollLoopUrl={room.camera?.recentClipUrl ?? null}
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : usesLivePreviewRung && previewUrl ? (
                  <CameraPlayer
                    key={room.camera?.id ?? room.roomKey}
                    priority="thumbnail"
                    playbackUrl={previewUrl}
                    playbackProtocol={room.camera?.previewProtocol ?? "whep"}
                    online={isOnline}
                    muted
                    className="h-full w-full object-cover"
                  />
                ) : loopUrl ? (
                  <RetryingLoopPreview url={loopUrl} online={isOnline} />
                ) : null}

                <RoomTileCrtHover />

                {/* Subtle Room Name in Top-Left Corner */}
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 rounded bg-black/70 px-2 py-0.5 backdrop-blur-sm">
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
