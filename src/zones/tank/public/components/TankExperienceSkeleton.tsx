"use client";

import React from "react";
import { ChromePanel } from "./ChromePanel";

/**
 * Pixel-accurate gamified loading skeleton for the Tank Console.
 * Renders the full metallic chassis with corner bolt screws and pulsing
 * phosphor/amber LED telemetry placeholders to prevent any layout shift.
 */
export function TankExperienceSkeleton() {
  return (
    <div
      className="min-h-screen min-h-[100dvh] select-none font-sans"
      style={{
        background: "radial-gradient(ellipse at 50% 20%, #2e4a38 0%, #152219 40%, #0a110d 100%)",
        color: "#241f14",
      }}
    >
      <div className="mx-auto max-w-[1800px] p-2 md:p-3">
        {/* Top Marquee Skeleton */}
        <ChromePanel
          withScrews
          className="mb-2 w-full"
          contentClassName="!px-8 !py-3 flex items-center justify-between gap-3 animate-pulse"
        >
          <div className="h-7 w-36 rounded-full bg-black/40 shadow-inner" />
          <div className="h-9 min-w-[260px] max-w-xl flex-1 rounded border border-black/50 bg-black/90 px-4 py-2" />
          <div className="hidden gap-2 sm:flex">
            <div className="h-7 w-20 rounded-full bg-black/40" />
            <div className="h-7 w-20 rounded-full bg-black/40" />
          </div>
        </ChromePanel>

        <div className="grid gap-2 md:grid-cols-[220px_minmax(0,1fr)_330px]">
          {/* Left Rail Skeletons */}
          <div className="hidden flex-col gap-2 md:flex">
            {/* Profile Skeleton */}
            <ChromePanel withScrews className="w-full" contentClassName="!px-6 !py-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-black/40" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-3 w-20 bg-black/40 rounded" />
                  <div className="h-2.5 w-14 bg-black/30 rounded" />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="h-7 flex-1 rounded bg-black/40" />
                <div className="h-7 flex-1 rounded bg-black/40" />
              </div>
            </ChromePanel>

            {/* Navigation Skeleton */}
            <ChromePanel withScrews className="w-full" contentClassName="!px-6 !py-4 flex flex-col gap-2 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-7 w-full rounded bg-black/30" />
              ))}
            </ChromePanel>

            {/* Inventory Skeleton */}
            <ChromePanel withScrews className="w-full" contentClassName="!px-6 !py-4 space-y-3 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="h-3 w-16 bg-black/40 rounded" />
                <div className="h-5 w-20 bg-black/40 rounded" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded border border-black/40 bg-black/40" />
                ))}
              </div>
            </ChromePanel>

            {/* Telemetry Skeleton */}
            <ChromePanel withScrews className="w-full" contentClassName="!px-6 !py-4 grid grid-cols-2 gap-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded border border-black/50 bg-black/90 p-2 text-center" />
              ))}
            </ChromePanel>
          </div>

          {/* Center Stage Skeletons */}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {/* Video Stage Frame */}
            <div className="relative aspect-video w-full overflow-hidden rounded border-2 border-black/60 bg-black/95 shadow-2xl flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 animate-pulse">
                <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                <span className="text-xs font-mono font-bold tracking-widest text-emerald-400">
                  CONNECTING LIVE CONSOLE...
                </span>
              </div>
            </div>

            {/* Camera Roster Skeleton */}
            <ChromePanel withScrews className="w-full" contentClassName="!px-7 !py-4 space-y-3 animate-pulse">
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <div className="h-7 w-20 rounded bg-black/40" />
                  <div className="h-7 w-20 rounded bg-black/40" />
                </div>
                <div className="h-6 w-32 rounded bg-black/80" />
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video rounded border border-black/50 bg-black/70" />
                ))}
              </div>
            </ChromePanel>
          </div>

          {/* Right Rail Chat Skeleton */}
          <ChromePanel
            withScrews
            className="flex min-h-[440px] flex-col md:sticky md:top-2 md:h-[calc(100vh-5.5rem)]"
            contentClassName="!p-0 flex flex-1 flex-col animate-pulse"
            style={{ background: "linear-gradient(180deg,#2b2d2e,#121314,#000)" }}
          >
            <div className="flex h-12 items-center justify-between border-b border-black/40 px-8">
              <div className="h-4 w-16 bg-black/50 rounded" />
              <div className="h-3 w-20 bg-black/50 rounded" />
            </div>
            <div className="flex-1 px-8 py-4 space-y-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-3 w-3/4 bg-white/10 rounded" />
              ))}
            </div>
          </ChromePanel>
        </div>
      </div>
    </div>
  );
}
