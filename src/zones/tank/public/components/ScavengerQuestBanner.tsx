// src/zones/tank/public/components/ScavengerQuestBanner.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Live Scavenger Hunt HUD Quest Banner
//
// Renders active scavenger hunt bounties, countdown timers, token rewards,
// and victory fanfare over the live video player.
// ─────────────────────────────────────────────────────────────────────────────

"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, Trophy, Clock, Target, CheckCircle2 } from "lucide-react";
import type { ScavengerQuest } from "../../server/scavengerHuntEngine";

export function ScavengerQuestBanner({
  quest,
  onClose,
}: {
  quest: ScavengerQuest | null;
  onClose?: () => void;
}) {
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!quest || quest.state !== "QUEST_ACTIVE") {
      setSecondsRemaining(0);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((quest.expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [quest]);

  if (!quest || quest.state === "IDLE_COOLDOWN" || quest.state === "EXPIRED") {
    return null;
  }

  const isClaimed = quest.state === "CLAIMED_FANFARE";

  return (
    <div className="pointer-events-none absolute top-3 inset-x-3 z-30 flex justify-center">
      <div
        className={`pointer-events-auto flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-2xl backdrop-blur-md transition-all duration-300 ${
          isClaimed
            ? "border-emerald-500/50 bg-emerald-950/80 text-emerald-200"
            : "border-amber-500/40 bg-black/80 text-white"
        }`}
      >
        {/* Item Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-2xl shadow-inner">
          {quest.item.icon || "🎯"}
        </div>

        {/* Quest Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                isClaimed
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {isClaimed ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Solved!
                </>
              ) : (
                <>
                  <Target className="h-3 w-3 animate-pulse" /> Live Quest
                </>
              )}
            </span>
            <span className="text-xs font-bold text-slate-300">
              {quest.roomTitle}
            </span>
          </div>

          <p className="truncate text-sm font-extrabold text-white">
            {isClaimed ? (
              <span>
                Found by{" "}
                <span className="text-emerald-300">
                  @{quest.claimedBy?.userName}
                </span>
                !
              </span>
            ) : (
              <span>Spot the [{quest.item.displayName}]!</span>
            )}
          </p>
        </div>

        {/* Reward & Timer */}
        <div className="flex shrink-0 items-center gap-3 border-l border-white/15 pl-3">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-xs font-black text-amber-300">
              <Trophy className="h-3.5 w-3.5" />
              <span>+{quest.item.rewardTokens} Tokens</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400">
              +{quest.item.rewardXp} XP
            </div>
          </div>

          {!isClaimed && (
            <div className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-black font-mono text-amber-200">
              <Clock className="h-3 w-3 animate-spin" />
              <span>{secondsRemaining}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
