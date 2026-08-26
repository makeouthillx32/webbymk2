"use client";

import React, { useEffect, useState } from "react";
import { Check, Flame, Trophy, X, Zap, Sparkles, Clock } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import {
  claimDailyRewardsAction,
  getDailyClaimStatusAction,
  type DailyClaimResult,
  type DailyClaimStatus,
} from "../../server/dailyRewards";

export type DailyClaimModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (res: DailyClaimResult) => void;
};

const DAILY_STREAK_MILESTONES = [1, 2, 3, 7, 14, 30, 50, 100] as const;

export function DailyClaimModal({ isOpen, onClose, onSuccess }: DailyClaimModalProps) {
  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<DailyClaimResult | null>(null);
  const [status, setStatus] = useState<DailyClaimStatus | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setResult(null);
    void getDailyClaimStatusAction()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await claimDailyRewardsAction();
      setResult(res);
      if (res.success && onSuccess) {
        onSuccess(res);
      }
      if (res.success) {
        setStatus((previous) => ({
          signedIn: true,
          currentStreak: res.streakDays ?? previous?.currentStreak ?? 1,
          longestStreak: res.longestStreak ?? previous?.longestStreak ?? 1,
          totalClaims: res.totalClaims ?? previous?.totalClaims ?? 1,
          canClaim: false,
          nextClaimAt: res.nextClaimAt ?? null,
          streakExpiresAt: res.streakExpiresAt ?? null,
          secondsUntilClaim: 24 * 60 * 60,
        }));
      }
    } catch {
      setResult({ success: false, error: "Failed to claim rewards. Try again later." });
    } finally {
      setClaiming(false);
    }
  };

  const streakDays = result?.streakDays ?? status?.currentStreak ?? 0;
  const claimable = status?.signedIn === true && status.canClaim;
  const milestones = DAILY_STREAK_MILESTONES;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Daily Streak & Login Rewards"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-md flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* Top Header Strip with Red Close Button */}
          <div className="relative flex items-center justify-between border-b border-black/40 px-8 py-3.5">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-orange-500 fill-orange-500 animate-pulse" />
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Daily Streak Console
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] text-white shadow transition hover:brightness-110 active:scale-95"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          {/* Console Body */}
          <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3.5 select-none">
            {/* Top Arcade Display Banner */}
            <div className="rounded border border-black/60 bg-black/90 p-3.5 text-center shadow-inner relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#eab308_1px,transparent_1px)] opacity-10 [background-size:8px_8px]" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-b from-amber-400 to-orange-600 border border-yellow-300 text-black shadow-md mb-2">
                  <Trophy className="h-6 w-6 stroke-[2.5]" />
                </div>
                <h3
                  className="text-sm font-black uppercase tracking-wider text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  XP Streak Progression
                </h3>
                <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                  Claim every 24 hours to multiply XP & Token rewards.
                </p>
              </div>
            </div>

            {/* Glowing 3-Stat Meters */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded border border-black/60 bg-black/90 p-2 text-center shadow-inner">
                <span className="block font-mono text-xl font-black text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]">
                  {streakDays}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Current
                </span>
              </div>
              <div className="rounded border border-black/60 bg-black/90 p-2 text-center shadow-inner">
                <span className="block font-mono text-xl font-black text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]">
                  {status?.longestStreak ?? 0}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Record
                </span>
              </div>
              <div className="rounded border border-black/60 bg-black/90 p-2 text-center shadow-inner">
                <span className="block font-mono text-xl font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.6)]">
                  {status?.totalClaims ?? 0}
                </span>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                  Claims
                </span>
              </div>
            </div>

            {/* Arcade Milestone Nodes */}
            <div className="rounded border border-black/60 bg-black/90 p-3 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <span className="text-[10px] font-black uppercase text-yellow-400 flex items-center gap-1.5">
                  <Zap className="h-3 w-3" /> Milestone Ladder
                </span>
                <span className="text-[9px] font-mono text-slate-400">Ticks 1 – 100</span>
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {milestones.map((day) => {
                  const isCompleted = day <= streakDays;
                  const isCurrent =
                    day > streakDays &&
                    milestones.find((value) => value > streakDays) === day;
                  return (
                    <div
                      key={day}
                      className={`flex flex-col items-center justify-center py-2 px-1 rounded border text-center transition-all ${
                        isCompleted
                          ? "bg-emerald-950/80 border-emerald-400/80 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                          : isCurrent
                          ? "bg-amber-950/80 border-yellow-400 text-yellow-300 ring-2 ring-yellow-400 animate-pulse shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                          : "bg-black/60 border-white/10 text-slate-500"
                      }`}
                    >
                      <span className="text-[8px] font-mono font-bold">D{day}</span>
                      <span className="text-xs my-0.5">
                        {isCompleted ? (
                          <Check className="h-3 w-3 stroke-[3] text-emerald-400" />
                        ) : day === 100 ? (
                          "🏆"
                        ) : (
                          "·"
                        )}
                      </span>
                      <span className="text-[7px] font-black uppercase tracking-tighter">
                        {isCompleted ? "DONE" : isCurrent ? "NEXT" : "LOCK"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Result Feedback Banner */}
            {result && (
              <div
                className={`p-3 rounded border text-center text-xs font-bold ${
                  result.success
                    ? "bg-emerald-950/90 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                    : "bg-red-950/90 border-red-500 text-red-300"
                }`}
              >
                {result.success ? (
                  <div>
                    <p className="font-black text-sm flex items-center justify-center gap-1.5 text-yellow-400">
                      <Sparkles className="h-4 w-4" /> Streak Claimed!
                    </p>
                    <p className="mt-1 text-slate-200">
                      +{result.xpAwarded} XP & +{result.tokensAwarded} Tokens added to your profile.
                    </p>
                  </div>
                ) : (
                  <p>{result.error}</p>
                )}
              </div>
            )}

            {/* Action Buttons & Cooldown Status */}
            {!result?.success && status === null && (
              <div className="rounded border border-black/60 bg-black/90 py-2.5 text-center text-xs font-mono text-slate-400 shadow-inner">
                Loading telemetry…
              </div>
            )}

            {!result?.success && status?.signedIn === false && (
              <div className="rounded border border-black/60 bg-black/90 py-2.5 text-center text-xs font-bold text-yellow-400 shadow-inner">
                Sign in to activate your streak rewards.
              </div>
            )}

            {!result?.success && claimable && (
              <ConsoleButton
                variant="orange"
                onClick={handleClaim}
                disabled={claiming}
                className="w-full !py-2.5 text-sm !font-black"
              >
                {claiming ? "Engaging Rewards..." : "Claim Daily Reward"}
              </ConsoleButton>
            )}

            {!result?.success && status?.signedIn === true && !claimable && (
              <div className="rounded border border-black/60 bg-black/90 py-2.5 text-center text-xs font-mono text-slate-400 shadow-inner flex items-center justify-center gap-2">
                <Clock className="h-3.5 w-3.5 text-yellow-400 animate-spin" />
                <span>Next reward in ~{Math.max(1, Math.ceil(status.secondsUntilClaim / 3600))}h</span>
              </div>
            )}

            {result?.success && (
              <ConsoleButton
                variant="gray"
                onClick={onClose}
                className="w-full !py-2.5 text-xs !font-black"
              >
                Return to Live Deck
              </ConsoleButton>
            )}
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

export default DailyClaimModal;
