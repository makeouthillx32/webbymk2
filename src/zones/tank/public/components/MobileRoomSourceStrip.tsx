"use client";

import React from "react";
import { Radio } from "lucide-react";
import { ACTIVE_THEME } from "../../theme";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";

export type MobileRoomSource = {
  roomKey: string;
  title: string;
  isOnline: boolean;
};

export type MobileRoomSourceStripProps = {
  mode: "director" | "room" | "grid";
  selectedRoomSlug: string;
  directorOnline: boolean;
  rooms: MobileRoomSource[];
  onSelectDirector: () => void;
  onSelectRoom: (roomKey: string) => void;
};

const LED_GREEN = "#39ff6a";
const LED_RED = "#ff3b2f";

function SourceLabel({ title, online }: { title: string; online: boolean }) {
  const color = online ? LED_GREEN : LED_RED;
  return (
    <>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }}
      />
      <span className="max-w-[8rem] truncate">{title}</span>
    </>
  );
}

export function MobileRoomSourceStrip({
  mode,
  selectedRoomSlug,
  directorOnline,
  rooms,
  onSelectDirector,
  onSelectRoom,
}: MobileRoomSourceStripProps) {
  const visibleRooms = rooms.filter(
    (room) => mode !== "room" || room.roomKey !== selectedRoomSlug,
  );
  const showDirector = mode !== "director";

  if (!showDirector && visibleRooms.length === 0) return null;

  return (
    <ChromePanel
      withScrews
      className="w-full"
      contentClassName="!px-5 !py-2.5"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 text-[#241f14]">
          <Radio className="h-3.5 w-3.5 text-[#ff4d00]" />
          <span
            className="text-[10px] font-black uppercase tracking-[0.14em]"
            style={{ fontFamily: ACTIVE_THEME.fonts.label }}
          >
            House Sources
          </span>
        </div>
        <span
          className="font-mono text-[8px] font-black uppercase tracking-wider text-[#4f4a3d]"
          style={{ fontFamily: ACTIVE_THEME.fonts.dotMatrix }}
        >
          Current hidden
        </span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {showDirector && (
          <ConsoleButton
            onClick={onSelectDirector}
            ariaLabel="Switch to Director"
            className="min-w-[7.5rem] shrink-0 !px-2.5 !py-1.5 !text-[10px]"
          >
            <SourceLabel title="Director" online={directorOnline} />
          </ConsoleButton>
        )}
        {visibleRooms.map((room) => (
          <ConsoleButton
            key={room.roomKey}
            onClick={() => onSelectRoom(room.roomKey)}
            ariaLabel={`Switch to ${room.title}`}
            className="min-w-[7.5rem] shrink-0 !px-2.5 !py-1.5 !text-[10px]"
          >
            <SourceLabel title={room.title} online={room.isOnline} />
          </ConsoleButton>
        ))}
      </div>
    </ChromePanel>
  );
}
