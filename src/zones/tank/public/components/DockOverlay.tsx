"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Lock,
  Ticket,
  Dices,
  CheckSquare2,
  Square,
  Sparkles,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import type { TankMission } from "../../server/gamification";

export type DockOverlayProps = {
  missions: TankMission[];
  onClose: () => void;
  onClaimDailyXp?: () => void;
  onOpenPrizeMachine?: () => void;
  onOpenSecretCode?: () => void;
  onGiftSeasonPass?: () => void;
  onCompleteMission?: (missionId: string) => void;
};

export function DockOverlay({
  missions = [],
  onClose,
  onClaimDailyXp,
  onOpenPrizeMachine,
  onOpenSecretCode,
  onGiftSeasonPass,
  onCompleteMission,
}: DockOverlayProps) {
  const [timeLeft, setTimeLeft] = useState("21:37:42");

  // Dynamic countdown to midnight UTC
  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const endOfDay = new Date();
      endOfDay.setUTCHours(24, 0, 0, 0);
      const diff = Math.max(0, endOfDay.getTime() - now.getTime());
      const hours = String(Math.floor(diff / (1000 * 60 * 60))).padStart(2, "0");
      const minutes = String(Math.floor((diff / (1000 * 60)) % 60)).padStart(2, "0");
      const seconds = String(Math.floor((diff / 1000) % 60)).padStart(2, "0");
      setTimeLeft(`${hours}:${minutes}:${seconds}`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, []);

  const defaultMissions: TankMission[] =
    missions.length > 0
      ? missions
      : [
          {
            id: "m-signin",
            title: "Sign in for the first time",
            description: "Create your Tank account and sign in.",
            xpReward: 50,
            tokenReward: 5,
            completed: false,
          },
          {
            id: "m-watch",
            title: "Watch a live camera",
            description: "Open any room and watch a live feed.",
            xpReward: 25,
            tokenReward: 2,
            completed: false,
          },
          {
            id: "m-chat",
            title: "Post your first chat message",
            description: "Say hello in global chat.",
            xpReward: 15,
            tokenReward: 1,
            completed: false,
          },
        ];

  return (
    <div
      className="fixed inset-x-0 bottom-14 z-50 flex justify-center p-2 sm:p-4 pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Dock"
    >
      {/* Click-away backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* Dock Container using the identical ChromePanel metal chassis */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto relative flex w-full max-w-2xl flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200"
      >
        <ChromePanel
          withScrews
          className="w-full shadow-2xl"
          contentClassName="!p-0 flex flex-col"
        >
          {/* ═══════════ TOP CONSOLE HEADER STRIP ═══════════ */}
          <div className="flex items-center justify-between border-b border-black/40 px-8 py-3">
            <h2
              className="text-base font-black uppercase tracking-widest text-[#241f14]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Dock
            </h2>

            {/* Top Right Quick Action Buttons */}
            <div className="flex items-center gap-1.5">
              {/* 1. Daily XP Button (Purple) */}
              <button
                type="button"
                onClick={onClaimDailyXp}
                className="flex h-7 w-7 items-center justify-center rounded border border-black/40 bg-gradient-to-b from-[#c084fc] to-[#9333ea] text-[11px] font-black text-white shadow transition hover:brightness-110 active:scale-95 select-none"
                title="Claim Daily XP"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                XP
              </button>

              {/* 2. Prize Machine Button (Blue) */}
              <button
                type="button"
                onClick={onOpenPrizeMachine}
                className="flex h-7 w-7 items-center justify-center rounded border border-black/40 bg-gradient-to-b from-[#60a5fa] to-[#2563eb] text-white shadow transition hover:brightness-110 active:scale-95 select-none"
                title="Prize Machine"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>

              {/* 3. Secret Code Button (Red Lock) */}
              <button
                type="button"
                onClick={onOpenSecretCode}
                className="flex h-7 w-7 items-center justify-center rounded border border-black/40 bg-gradient-to-b from-[#f87171] to-[#dc2626] text-white shadow transition hover:brightness-110 active:scale-95 select-none"
                title="Secret Code"
              >
                <Lock className="h-3.5 w-3.5" />
              </button>

              {/* 4. Gift Season Pass (Yellow Ticket) */}
              <button
                type="button"
                onClick={onGiftSeasonPass}
                className="flex h-7 w-7 items-center justify-center rounded border border-black/40 bg-gradient-to-b from-[#fde047] to-[#ca8a04] text-[#241f14] shadow transition hover:brightness-110 active:scale-95 select-none"
                title="Gift Season Pass"
              >
                <Ticket className="h-3.5 w-3.5" />
              </button>

              {/* 5. Close Button (Coral) */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Dock"
                className="flex h-7 w-7 items-center justify-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95 select-none"
              >
                <X className="h-4 w-4 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* ═══════════ DAILY MISSIONS INNER RECESS ═══════════ */}
          <div
            className="px-8 py-3.5 space-y-3 bg-gradient-to-b from-[#18191a] via-[#121314] to-[#0a0a0b]"
            style={{
              boxShadow: "inset 0 4px 12px rgba(0,0,0,0.8)",
            }}
          >
            {/* Header with Countdown Timer & Reroll Button */}
            <div className="flex items-center justify-between">
              <h3
                className="text-xs font-black uppercase tracking-wider text-slate-300"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Daily Missions
              </h3>

              <div className="flex items-center gap-2">
                {/* Green Countdown Box */}
                <div className="rounded border border-black/80 bg-black px-2.5 py-0.5 shadow-inner">
                  <span
                    className="text-xs font-black tracking-widest text-[#39ff6a]"
                    style={{
                      fontFamily: ACTIVE_THEME.fonts.dotMatrix,
                      textShadow: "0 0 6px rgba(57,255,106,0.8)",
                    }}
                  >
                    {timeLeft}
                  </span>
                </div>

                {/* Reroll Dice Button */}
                <ConsoleButton
                  variant="gray"
                  onClick={() => alert("Missions rerolled!")}
                  className="!px-2 !py-1 !text-xs"
                  ariaLabel="Reroll Missions"
                >
                  <Dices className="h-3.5 w-3.5" />
                </ConsoleButton>
              </div>
            </div>

            {/* Missions List Cards */}
            <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pb-3">
              {defaultMissions.map((mission) => (
                <div
                  key={mission.id}
                  onClick={() => onCompleteMission?.(mission.id)}
                  className={`group relative flex items-center justify-between rounded border p-3 shadow-md transition cursor-pointer ${
                    mission.completed
                      ? "border-white/5 bg-black/40 opacity-70"
                      : "border-black/70 bg-[#1c1d1f] hover:border-yellow-400 hover:bg-[#25272a]"
                  }`}
                >
                  {/* Left: Checkbox + Title + Description */}
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-black/80 bg-black/90 text-[#39ff6a] shadow-inner"
                    >
                      {mission.completed ? (
                        <CheckSquare2 className="h-3.5 w-3.5 fill-[#39ff6a] text-black" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-transparent" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-0.5">
                      <p
                        className="text-xs font-black uppercase tracking-wide text-white leading-snug"
                        style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                      >
                        {mission.title}
                      </p>
                      <p className="text-[11px] font-medium text-slate-400">
                        {mission.description}
                      </p>
                    </div>
                  </div>

                  {/* Right: XP Reward */}
                  <div className="shrink-0 pl-3">
                    <span
                      className="text-xs font-black tracking-wide text-[#facc15]"
                      style={{
                        fontFamily: ACTIVE_THEME.fonts.label,
                        textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                      }}
                    >
                      {mission.xpReward} XP
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
