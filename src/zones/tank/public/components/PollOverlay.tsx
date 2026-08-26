"use client";

import React, { useEffect, useState } from "react";
import { Check, Loader2, Radio, Vote, X } from "lucide-react";
import { votePollAction } from "../../server/pollSystem";
import type { PollView } from "../../server/pollContract";
import { ACTIVE_THEME } from "../../theme";
import { ChromePanel } from "./ChromePanel";

export type PollOverlayProps = {
  onClose: () => void;
  onVoteRecorded?: () => void;
};

export function getTankPollVoterClientId() {
  if (typeof window === "undefined") return "anon_guest";
  let id = localStorage.getItem("tank_voter_client_id");
  if (!id) {
    id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    try { localStorage.setItem("tank_voter_client_id", id); } catch {}
  }
  return id;
}

export function PollOverlay({ onClose, onVoteRecorded }: PollOverlayProps) {
  const [activePoll, setActivePoll] = useState<PollView | null>(null);
  const [loading, setLoading] = useState(true);
  const [votingIndex, setVotingIndex] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  const fetchPoll = async () => {
    try {
      const res = await fetch("/api/tank/poll/active", {
        headers: { "x-tank-voter-id": getTankPollVoterClientId() },
      });
      const { poll } = (await res.json()) as { poll: PollView | null };
      setActivePoll(poll);
      setSelectedOption(poll?.viewerVote ?? null);
    } catch {
      setActivePoll(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPoll();
    const interval = window.setInterval(() => void fetchPoll(), 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activePoll?.expiresAt) {
      setTimeRemaining(null);
      return;
    }
    const update = () => setTimeRemaining(
      Math.max(0, Math.floor((activePoll.expiresAt! - Date.now()) / 1000)),
    );
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [activePoll]);

  const handleVote = async (index: number) => {
    if (!activePoll || votingIndex !== null || selectedOption !== null) return;
    setVotingIndex(index);
    const result = await votePollAction({
      pollId: activePoll.id,
      optionIndex: index,
      anonymousClientId: getTankPollVoterClientId(),
    });
    if (result.success && result.poll) {
      setActivePoll(result.poll);
      setSelectedOption(result.poll.viewerVote ?? index);
      onVoteRecorded?.();
    }
    setVotingIndex(null);
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md animate-in fade-in duration-150 sm:p-4"
      onClick={onClose}
    >
      <ChromePanel
        withScrews
        className="max-h-[92vh] w-full max-w-md"
        contentClassName="!px-3 !py-3 sm:!px-5 sm:!py-4"
      >
        <div
          className="flex max-h-[86vh] flex-col overflow-hidden rounded-sm border-2 border-black/80 bg-[#080b0c] shadow-[inset_0_0_20px_rgba(0,0,0,.9)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b-2 border-black/80 bg-[#c7c1ad] px-3 py-2 text-[#241f14] shadow-[inset_0_-1px_0_rgba(255,255,255,.4)]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border-2 border-black/70 bg-[#ff4d00] shadow-[0_2px_0_#000]">
                <Vote className="h-4 w-4 text-white" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-black uppercase tracking-[0.16em]" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                  House Poll Console
                </p>
                <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-[#5b5547]">
                  Guest voting online · one selection
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close House Poll"
              className="grid h-7 w-7 place-items-center rounded-sm border border-black/60 bg-[#252725] text-white shadow-[0_2px_0_#000] active:translate-y-px"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto p-3 sm:p-4">
            {loading ? (
              <div className="grid min-h-52 place-items-center">
                <div className="flex flex-col items-center gap-2 text-[#39ff6a]">
                  <Loader2 className="h-7 w-7 animate-spin" />
                  <span className="font-mono text-[10px] font-black uppercase tracking-[0.2em]">Tuning poll signal</span>
                </div>
              </div>
            ) : activePoll ? (
              <div className="space-y-3">
                <div className="rounded-sm border border-[#304431] bg-[#101712] p-3 shadow-[inset_0_0_14px_rgba(57,255,106,.07)]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-[#39ff6a]">
                      <Radio className="h-3 w-3 animate-pulse" /> Live house vote
                    </span>
                    {timeRemaining !== null && (
                      <span className="rounded-sm border border-[#445047] bg-black/70 px-2 py-0.5 font-mono text-[9px] font-bold text-[#39ff6a]">
                        {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-black uppercase leading-snug text-[#e7e2d6] sm:text-base" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                    {activePoll.question}
                  </h3>
                  <p className="mt-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#8e938f]">
                    {activePoll.totalVotes} vote{activePoll.totalVotes === 1 ? "" : "s"} received
                  </p>
                </div>

                <div className="grid gap-2">
                  {activePoll.options.map((option, index) => {
                    const percentage = activePoll.totalVotes > 0
                      ? Math.round((option.votes / activePoll.totalVotes) * 100)
                      : 0;
                    const selected = selectedOption === index;
                    const disabled = selectedOption !== null || votingIndex !== null;
                    return (
                      <button
                        key={option.id || index}
                        type="button"
                        disabled={disabled}
                        onClick={() => void handleVote(index)}
                        className={`group relative flex min-h-12 w-full items-center justify-between overflow-hidden rounded-sm border-2 px-3 py-2 text-left shadow-[0_3px_0_#000] transition active:translate-y-px active:shadow-none ${
                          selected
                            ? "border-[#ff6a2a] bg-[#4a2416] text-white shadow-[0_0_12px_rgba(255,77,0,.35)]"
                            : disabled
                              ? "border-[#34383a] bg-[#171a1b] text-slate-400"
                              : "border-[#4d5152] bg-[#202426] text-white hover:border-[#ff6a2a] hover:bg-[#292e30]"
                        }`}
                      >
                        <span className="pointer-events-none absolute inset-y-0 left-0 bg-[#ff4d00]/20 transition-all duration-300" style={{ width: `${percentage}%` }} />
                        <span className="relative z-10 flex min-w-0 items-center gap-2.5">
                          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-sm border text-[10px] font-black ${selected ? "border-[#ff6a2a] bg-[#ff4d00] text-white" : "border-white/20 bg-black/60 text-[#cfc9b8]"}`}>
                            {votingIndex === index ? <Loader2 className="h-3 w-3 animate-spin" /> : selected ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + index)}
                          </span>
                          <span className="truncate text-xs font-black uppercase tracking-wide" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                            {option.text}
                          </span>
                        </span>
                        <span className="relative z-10 ml-2 shrink-0 font-mono text-[10px] font-black text-[#f3b64a]">
                          {percentage}% · {option.votes}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-[#2c332d] pt-2 font-mono text-[8px] font-black uppercase tracking-wider text-[#8b948c]">
                  <span>Guests enabled</span>
                  <span className="text-[#39ff6a]">{selectedOption === null ? "Selection ready" : "Vote locked in"}</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center text-center">
                <span className="mb-3 grid h-14 w-14 place-items-center rounded-sm border-2 border-[#3d4142] bg-[#171a1b] shadow-[0_3px_0_#000]">
                  <Vote className="h-7 w-7 text-[#f3b64a]" />
                </span>
                <h4 className="text-sm font-black uppercase tracking-[0.16em] text-white" style={{ fontFamily: ACTIVE_THEME.fonts.label }}>
                  Poll console standing by
                </h4>
                <p className="mt-2 max-w-[250px] text-[10px] font-bold leading-relaxed text-[#8e938f]">
                  House directors can open a live vote here without interrupting chat.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[#34383a] bg-[#111314] px-3 py-2 font-mono text-[8px] font-black uppercase tracking-wider text-[#8e938f]">
            <span>Public audience input</span>
            <span className="flex items-center gap-1 text-[#39ff6a]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#39ff6a] shadow-[0_0_6px_#39ff6a]" /> Realtime
            </span>
          </div>
        </div>
      </ChromePanel>
    </div>
  );
}
