"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  Coins,
  Dice5,
  Flame,
  Keyboard,
  Package,
  Radio,
  ScrollText,
  Sparkles,
  Target,
  Vote,
  Zap,
  Check,
  BarChart2,
} from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import type { TankMission } from "../../server/gamification";
import type { ChatMessage } from "../../contracts";
import { votePollAction } from "../../server/pollSystem";
import type { PollView } from "../../server/pollContract";
import { TankChatBody } from "../TankChatEmoji";

export type SidebarTab = "missions" | "logs" | "poll";

export type MissionsTabsPanelProps = {
  sidebarTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  missions: TankMission[];
  messages: ChatMessage[];
  onCompleteMission?: (id: string) => void;
};

// Helper: map mission title / category to a gamified icon
function getMissionIcon(title: string) {
  const lower = title.toLowerCase();
  if (lower.includes("press t") || lower.includes("chat") || lower.includes("message")) {
    return <Keyboard className="h-3.5 w-3.5 text-sky-400" />;
  }
  if (lower.includes("luck") || lower.includes("roll") || lower.includes("flip") || lower.includes("dice")) {
    return <Dice5 className="h-3.5 w-3.5 text-amber-400" />;
  }
  if (lower.includes("item") || lower.includes("inventory") || lower.includes("toy") || lower.includes("pumpkin")) {
    return <Package className="h-3.5 w-3.5 text-purple-400" />;
  }
  if (lower.includes("scavenger") || lower.includes("hunt") || lower.includes("camera") || lower.includes("target")) {
    return <Target className="h-3.5 w-3.5 text-emerald-400" />;
  }
  return <Zap className="h-3.5 w-3.5 text-yellow-400" />;
}

export function MissionsTabsPanel({
  sidebarTab,
  onTabChange,
  missions = [],
  messages = [],
  onCompleteMission,
}: MissionsTabsPanelProps) {
  // Live daily countdown timer (resets at midnight UTC)
  const [timeLeft, setTimeLeft] = useState("02:14:38");
  
  // Live Poll state
  const [activePoll, setActivePoll] = useState<PollView | null>(null);
  const [votingIndex, setVotingIndex] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  const getVoterClientId = () => {
    if (typeof window === "undefined") return "anon_guest";
    let id = localStorage.getItem("tank_voter_client_id");
    if (!id) {
      id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        localStorage.setItem("tank_voter_client_id", id);
      } catch {}
    }
    return id;
  };

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const endOfDay = new Date(now);
      endOfDay.setUTCHours(24, 0, 0, 0);
      const diff = Math.max(0, endOfDay.getTime() - now.getTime());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(
        `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll state fetcher
  useEffect(() => {
    const fetchPoll = async () => {
      try {
        const clientId = getVoterClientId();
        const res = await fetch("/api/tank/poll/active", {
          headers: { "x-tank-voter-id": clientId },
        });
        const { poll } = (await res.json()) as { poll: PollView | null };
        setActivePoll(poll);
        if (poll) {
          setSelectedOption(poll.viewerVote ?? null);
        }
      } catch {}
    };

    void fetchPoll();
    const interval = setInterval(fetchPoll, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleVote = async (index: number) => {
    if (!activePoll || votingIndex !== null) return;
    setVotingIndex(index);
    setSelectedOption(index);
    try {
      const clientId = getVoterClientId();
      const res = await votePollAction({
        pollId: activePoll.id,
        optionIndex: index,
        anonymousClientId: clientId,
      });
      if (res.success && res.poll) {
        setActivePoll(res.poll);
      }
    } finally {
      setVotingIndex(null);
    }
  };

  const completedCount = missions.filter((m) => m.completedAt).length;

  return (
    <ChromePanel
      withScrews
      className="flex flex-1 flex-col overflow-hidden shadow-2xl"
      contentClassName="!p-0 flex flex-1 flex-col"
    >
      {/* ═══════════ TOP HARDWARE TABS SWITCHER (EFFORTLESS HITBOXES) ═══════════ */}
      <div 
        className="flex items-center gap-1.5 border-b-2 border-black/90 bg-[#252830] px-3 pt-2 pb-1.5 shadow-[inset_0_2px_4px_rgba(255,255,255,0.1)]"
        style={{
          backgroundImage: "url(https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/metal-small-comp.webp)",
          backgroundRepeat: "repeat",
        }}
      >
        {(
          [
            { id: "missions" as const, label: "Missions", count: missions.length },
            { id: "logs" as const, label: "Logs", count: messages.length ? Math.min(messages.length, 99) : null },
            { id: "poll" as const, label: "Poll", count: activePoll ? 1 : null },
          ] as const
        ).map((tab) => {
          const isActive = sidebarTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`group relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-t px-2 text-[10px] font-black uppercase tracking-wider transition-all select-none active:translate-y-[1px] ${
                isActive
                  ? "border-t border-x border-black/90 bg-gradient-to-b from-[#f26d4b] via-[#e55936] to-[#c84423] text-white shadow-[0_2px_6px_rgba(242,109,75,0.4),inset_0_1px_1px_rgba(255,255,255,0.6)]"
                  : "border border-black/60 bg-[#17191e]/90 text-slate-300 hover:bg-[#20232a] hover:text-white"
              }`}
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              {/* Active illuminated dot */}
              {isActive && (
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-300 shadow-[0_0_6px_#fde047]" />
              )}
              <span>{tab.label}</span>
              {tab.count !== null && tab.count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[8px] font-black ${
                    isActive ? "bg-black/40 text-white" : "bg-black/70 text-amber-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════════ INNER GAMIFIED TEXTURED RECESSED CONSOLE CAVITY ═══════════ */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden p-3 text-slate-200"
        style={{
          backgroundColor: "#111317",
          backgroundImage: "url(https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-dark.png)",
          backgroundRepeat: "repeat",
          boxShadow: "inset 0 4px 14px rgba(0,0,0,0.9), inset 0 -2px 6px rgba(0,0,0,0.8)",
        }}
      >
        {/* Subtle CRT Scanline overlay */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-10 mix-blend-overlay z-0"
          style={{
            backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.4) 50%)",
            backgroundSize: "100% 4px",
          }}
        />

        {/* ──────────────── TAB: MISSIONS ──────────────── */}
        {sidebarTab === "missions" && (
          <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
            {/* Header: Title + Countdown */}
            <div className="mb-2.5 flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />
                <span
                  className="text-[10px] font-black uppercase tracking-wider text-slate-300"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Daily Directives
                </span>
              </div>

              {/* Dot Matrix Countdown Box */}
              <div className="flex items-center gap-1 rounded border border-black/90 bg-black/90 px-2 py-0.5 shadow-inner">
                <Clock className="h-2.5 w-2.5 text-[#39ff6a]" />
                <span
                  className="text-[9px] font-black tracking-widest text-[#39ff6a]"
                  style={{
                    fontFamily: ACTIVE_THEME.fonts.dotMatrix,
                    textShadow: "0 0 4px rgba(57,255,106,0.8)",
                  }}
                >
                  {timeLeft}
                </span>
              </div>
            </div>

            {/* Missions List Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 pb-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/40 [&::-webkit-scrollbar-thumb]:rounded-full">
              {missions.length === 0 ? (
                <div className="rounded border border-white/10 bg-black/50 p-4 text-center">
                  <p className="text-[11px] font-medium text-slate-400">
                    No active missions right now. Check back at daily reset!
                  </p>
                </div>
              ) : (
                missions.map((mission) => {
                  const isDone = Boolean(mission.completedAt);
                  return (
                    <div
                      key={mission.id}
                      onClick={() => onCompleteMission?.(mission.id)}
                      className={`group relative flex items-center justify-between gap-2 rounded border p-2.5 shadow-md transition-all cursor-pointer select-none ${
                        isDone
                          ? "border-emerald-500/30 bg-black/60 opacity-80 hover:opacity-100"
                          : "border-black/90 bg-[#1e2128]/90 hover:border-yellow-400/70 hover:bg-[#262a33] shadow-[inset_0_1px_2px_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.7)] active:scale-[0.99]"
                      }`}
                    >
                      {/* Left: Icon + Titles */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded border shadow-inner ${
                            isDone
                              ? "border-emerald-500/40 bg-emerald-950/50 text-emerald-400"
                              : "border-white/10 bg-black/70 text-slate-300 group-hover:border-yellow-400/40"
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]" />
                          ) : (
                            getMissionIcon(mission.title)
                          )}
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <p
                            className={`text-[11px] font-black uppercase leading-tight truncate ${
                              isDone ? "text-slate-400 line-through" : "text-white group-hover:text-yellow-300"
                            }`}
                            style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                          >
                            {mission.title}
                          </p>

                          {/* Reward chips */}
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-400">
                              <Coins className="h-2.5 w-2.5" />
                              {mission.rewardTokens}
                            </span>
                            <span className="text-[9px] font-bold text-purple-300">
                              +{mission.rewardXp} XP
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Status Pill */}
                      <div className="shrink-0">
                        {isDone ? (
                          <span className="rounded bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.3)]">
                            Claimed
                          </span>
                        ) : (
                          <span className="rounded bg-black/70 border border-white/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-slate-400 group-hover:border-yellow-400/40 group-hover:text-yellow-400">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Gamified Streak & Pool Summary Footer */}
            <div className="mt-2.5 rounded border border-black/90 bg-black/80 p-2 shadow-inner">
              <div className="flex items-center justify-between text-[9px] font-bold">
                <span className="flex items-center gap-1 text-amber-400">
                  <Flame className="h-3 w-3 text-orange-500 fill-orange-500 animate-pulse" />
                  Streak: <strong className="text-white">3 Days</strong> (1.2x XP)
                </span>
                <span className="text-slate-400">
                  {completedCount}/{missions.length} Complete
                </span>
              </div>

              {/* Mini XP Progress Bar */}
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/90 border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 via-amber-400 to-emerald-400 transition-all duration-500"
                  style={{
                    width: `${missions.length > 0 ? (completedCount / missions.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ──────────────── TAB: LOGS ──────────────── */}
        {sidebarTab === "logs" && (
          <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
              <span
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-300"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                <ScrollText className="h-3.5 w-3.5 text-sky-400" />
                Live Dispatch Log
              </span>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 animate-pulse">
                ● LIVE
              </span>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto pr-1 pb-1 font-mono text-[10px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
              {messages.length === 0 ? (
                <div className="rounded border border-white/10 bg-black/50 p-4 text-center">
                  <p className="text-[11px] font-medium text-slate-400">No activity logged yet.</p>
                </div>
              ) : (
                messages
                  .slice(-14)
                  .reverse()
                  .map((message) => (
                    <div
                      key={message.id}
                      className="rounded border border-black/70 bg-black/60 px-2 py-1 shadow-inner text-slate-300 flex items-start gap-1.5"
                    >
                      <span className="text-slate-500 font-bold shrink-0">
                        {message.time || "LOG"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <strong className="text-yellow-400 mr-1">{message.user}:</strong>
                        <TankChatBody text={message.text || message.body} />
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* ──────────────── TAB: POLL (INTERACTIVE GAMIFIED VOTING) ──────────────── */}
        {sidebarTab === "poll" && (
          <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
            {activePoll ? (
              <div className="flex flex-1 flex-col justify-between overflow-y-auto pr-1">
                <div>
                  <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-300"
                      style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                    >
                      <Vote className="h-3.5 w-3.5 text-amber-400 animate-bounce" />
                      Live House Vote
                    </span>
                    <span className="rounded bg-red-950/80 border border-red-500/50 px-1.5 py-0.2 text-[8px] font-black uppercase tracking-widest text-red-400 animate-pulse">
                      ACTIVE
                    </span>
                  </div>

                  {/* Poll Question Box */}
                  <div className="rounded border border-black/90 bg-[#1c1e24] p-2.5 mb-2.5 shadow-md">
                    <p 
                      className="text-xs font-black uppercase leading-snug text-white"
                      style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                    >
                      {activePoll.question}
                    </p>
                    <p className="mt-1 text-[9px] font-medium text-slate-400">
                      {activePoll.totalVotes} total vote{activePoll.totalVotes === 1 ? "" : "s"} cast
                    </p>
                  </div>

                  {/* Options List */}
                  <div className="space-y-2">
                    {activePoll.options.map((opt, idx) => {
                      const percentage =
                        activePoll.totalVotes > 0
                          ? Math.round((opt.votes / activePoll.totalVotes) * 100)
                          : 0;
                      const isSelected = selectedOption === idx;

                      return (
                        <button
                          key={opt.id || idx}
                          type="button"
                          disabled={votingIndex !== null}
                          onClick={() => handleVote(idx)}
                          className={`group relative w-full text-left rounded border p-2 shadow transition-all select-none active:scale-[0.99] ${
                            isSelected
                              ? "border-amber-400 bg-[#2b251a] shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                              : "border-black/90 bg-[#17191e] hover:border-amber-400/60 hover:bg-[#20232a]"
                          }`}
                        >
                          {/* Progress fill background */}
                          <div
                            className="absolute inset-0 rounded bg-amber-500/15 transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />

                          <div className="relative z-10 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-black ${
                                  isSelected
                                    ? "border-amber-400 bg-amber-400 text-black shadow-[0_0_6px_#fde047]"
                                    : "border-white/20 bg-black/60 text-slate-300 group-hover:border-amber-400/50 group-hover:text-white"
                                }`}
                              >
                                {isSelected ? <Check className="h-3 w-3" /> : idx + 1}
                              </span>
                              <span
                                className="text-[11px] font-bold text-slate-200 truncate group-hover:text-white"
                                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                              >
                                {opt.text}
                              </span>
                            </div>

                            <span className="text-[10px] font-black text-amber-400 font-mono shrink-0">
                              {percentage}%
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 rounded border border-black/80 bg-black/70 p-2 text-center text-[9px] font-bold text-slate-400">
                  ⚡ Tap any option to cast your vote
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-4 text-center">
                <div className="rounded-full bg-black/70 border border-white/10 p-3 mb-2 shadow-inner">
                  <Vote className="h-6 w-6 text-amber-400 opacity-80 animate-pulse" />
                </div>
                <p
                  className="text-xs font-black uppercase tracking-wider text-white"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Awaiting Flash Poll
                </p>
                <p className="mt-1 text-[10px] text-slate-400 max-w-[200px]">
                  House directors trigger live interactive audience votes during show events.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </ChromePanel>
  );
}
