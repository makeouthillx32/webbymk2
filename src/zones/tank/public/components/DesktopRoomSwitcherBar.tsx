"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";

export type DesktopRoomSource = {
  roomKey: string;
  title: string;
  isOnline?: boolean;
};

export type DesktopRoomSwitcherBarProps = {
  mode: "director" | "room" | "grid";
  activeRoomSlug: string;
  rooms: DesktopRoomSource[];
  onSelectDirector: () => void;
  onSelectRoom: (roomKey: string) => void;
};

export function DesktopRoomSwitcherBar({
  mode,
  activeRoomSlug,
  rooms,
  onSelectDirector,
  onSelectRoom,
}: DesktopRoomSwitcherBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Drag-to-scroll state
  const isPointerDownRef = useRef(false);
  const startXRef = useRef(0);
  const startScrollLeftRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2);
  }, []);

  useEffect(() => {
    checkScrollability();
    const el = scrollRef.current;
    if (!el) return;

    const handleResize = () => checkScrollability();
    window.addEventListener("resize", handleResize, { passive: true });
    el.addEventListener("scroll", checkScrollability, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      el.removeEventListener("scroll", checkScrollability);
    };
  }, [checkScrollability, rooms]);

  // Scroll active room button into view on change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>("[data-active='true']");
    if (activeEl) {
      activeEl.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [mode, activeRoomSlug]);

  // Handle mouse wheel -> horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
      el.scrollLeft += e.deltaY;
    }
  };

  // Pointer drag-to-scroll handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (e.button !== 0) return;
    isPointerDownRef.current = true;
    startXRef.current = e.clientX;
    startScrollLeftRef.current = el.scrollLeft;
    hasDraggedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    const diff = e.clientX - startXRef.current;
    if (Math.abs(diff) > 4) {
      hasDraggedRef.current = true;
      if (!isDragging) setIsDragging(true);
      el.scrollLeft = startScrollLeftRef.current - diff;
    }
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
    setTimeout(() => {
      hasDraggedRef.current = false;
      setIsDragging(false);
    }, 50);
  };

  const handleScrollBy = (amount: number) => {
    scrollRef.current?.scrollBy({ left: amount, behavior: "smooth" });
  };

  const handleDirectorClick = () => {
    if (hasDraggedRef.current) return;
    onSelectDirector();
  };

  const handleRoomClick = (roomKey: string) => {
    if (hasDraggedRef.current) return;
    onSelectRoom(roomKey);
  };

  return (
    <ChromePanel
      withScrews
      className="hidden w-full lg:block"
      contentClassName="!px-3 !py-1 flex items-center min-h-[44px] relative"
    >
      {/* Left Chevron Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScrollBy(-220)}
          aria-label="Scroll rooms left"
          className="absolute left-1.5 z-20 grid h-7 w-7 place-items-center rounded border border-black/50 bg-black/80 text-amber-400 shadow-md transition hover:bg-black hover:text-amber-300 active:scale-95"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Scrollable Room Container */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`custom-scrollbar flex min-w-0 flex-1 flex-row items-center gap-1.5 overflow-x-auto py-1 px-5 touch-pan-x select-none ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          scrollBehavior: "smooth",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div data-active={mode === "director" ? "true" : "false"} className="shrink-0">
          <ConsoleButton
            active={mode === "director"}
            variant={mode === "director" ? "orange" : "gray"}
            className="shrink-0"
            onClick={handleDirectorClick}
          >
            🌐 Director
          </ConsoleButton>
        </div>

        {rooms.map((room) => {
          const active = mode === "room" && activeRoomSlug === room.roomKey;
          return (
            <div
              key={room.roomKey}
              data-active={active ? "true" : "false"}
              className="shrink-0"
            >
              <ConsoleButton
                active={active}
                variant={active ? "orange" : "gray"}
                className="shrink-0"
                onClick={() => handleRoomClick(room.roomKey)}
              >
                {room.title}
              </ConsoleButton>
            </div>
          );
        })}
      </div>

      {/* Right Chevron Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => handleScrollBy(220)}
          aria-label="Scroll rooms right"
          className="absolute right-1.5 z-20 grid h-7 w-7 place-items-center rounded border border-black/50 bg-black/80 text-amber-400 shadow-md transition hover:bg-black hover:text-amber-300 active:scale-95"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </ChromePanel>
  );
}
