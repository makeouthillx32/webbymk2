"use client";

// Tank Tavern — the player-facing panel. Behind tank_tavern_enabled; renders
// a plain "not open yet" state until Phase 5 flips the flag.
//
// Renders as an `absolute inset-0` takeover of whatever it's mounted inside
// — NOT a fixed fullscreen modal. It's only ever mounted inside
// ChatConsolePanel (opened from the RNG mini-games/dice menu), so its
// nearest positioned ancestor is the chat panel's own ChromePanel, and it
// covers exactly that — never the camera feeds, the left rail, or anything
// else. Per design: Tavern only ever overlays chat, nothing else.
//
// State comes from polling /api/tank/tavern (a plain route, not a "use
// server" export called on a timer — see that route's comment for why:
// PollOverlay.tsx took down the page with exactly that mistake once
// already). Mutating actions (join/leave queue, resolve a chit, start/vote
// a mutiny, trigger SFX, use the Apron Snatcher) go through their own
// server actions, each already wired to broadcast on success — the poll
// just needs to be frequent enough to pick up tick()-only changes, not
// action-triggered ones.

import React, { useEffect, useState, useCallback } from "react";
import { X, Beer, Users, Flame, Volume2, Swords, Crown } from "lucide-react";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { ACTIVE_THEME } from "../theme";
import type { TavernChit, TavernSnapshot } from "../tavernTypes";
import { joinTavernQueueAction, leaveTavernQueueAction, getTavernQueueStatusAction } from "../server/tavernQueue";
import { resolveTavernChitAction } from "../server/tavernChits";
import { startTavernMutinyAction, castTavernMutinyVoteAction } from "../server/tavernMutiny";
import { triggerTavernSfxAction } from "../server/tavernSfx";

const POLL_MS = 6000;
const AMBER = "#b45309";

export type TavernPanelProps = {
  onClose: () => void;
  signedIn: boolean;
  currentUserId?: string | null;
  onOpenSignIn: () => void;
};

function formatCountdown(deadlineIso: string): string {
  const ms = new Date(deadlineIso).getTime() - Date.now();
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function chitResponseOptions(chit: TavernChit): { key: string; label: string }[] {
  if (chit.troubleType) {
    return [{ key: `handle:${chit.troubleType}`, label: chit.troubleType === "spill" ? "Clean it up" : "Say hello" }];
  }
  const item = (chit.payload?.item as string | undefined) ?? null;
  if (!item) return [];
  return [{ key: `serve:${item}`, label: `Serve ${item}` }];
}

export function TavernPanel({ onClose, signedIn, currentUserId, onOpenSignIn }: TavernPanelProps) {
  const [snapshot, setSnapshot] = useState<TavernSnapshot | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [inQueue, setInQueue] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tank/tavern");
      const data = (await res.json()) as TavernSnapshot;
      setSnapshot(data);
    } catch {}
    if (signedIn) {
      try {
        const q = await getTavernQueueStatusAction();
        setInQueue(q.inQueue);
        setQueuePosition(q.position);
      } catch {}
    }
  }, [signedIn]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Local 1s countdown re-render — snapshot itself only refreshes every 6s.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const shift = snapshot?.shift ?? null;
  const isBartender = !!shift && !!currentUserId && shift.bartenderId === currentUserId;
  const canMutiny = !!shift && !!currentUserId && shift.bartenderId !== currentUserId && !snapshot?.mutiny;

  async function withBusy(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#1a1b1e]"
      role="dialog"
      aria-modal="true"
      aria-label="Tank Tavern"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-black/50 px-3 sm:h-12 sm:px-4">
        <h2
          className="flex items-center gap-2 text-sm font-black text-white uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:text-base"
          style={{ fontFamily: ACTIVE_THEME.fonts.label }}
        >
          <Beer className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: AMBER }} />
          Tavern
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded bg-[#e85a4f] text-white shadow hover:scale-105 active:scale-95 border border-white/40"
          aria-label="Close Tavern"
        >
          <X className="h-4 w-4 stroke-[3]" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3">
          {!snapshot?.enabled ? (
            <div className="my-3 rounded-lg bg-black/80 p-4 border border-white/10 text-center">
              <p className="text-sm font-bold text-white">The Tavern isn't open yet.</p>
              <p className="mt-1 text-xs text-slate-400">Check back once producers turn it on.</p>
            </div>
          ) : (
            <div className="my-2 flex flex-col gap-3">
              {shift ? (
                <div className="rounded-lg bg-black/80 p-3 border border-white/10 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4" style={{ color: AMBER }} />
                      <span className="text-sm font-black">{shift.bartenderName}</span>
                      {shift.clickBonusApplies && (
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">
                          Click Bonus
                        </span>
                      )}
                      {isBartender && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-black" style={{ background: AMBER }}>
                          You
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-xs text-slate-300">{formatCountdown(shift.deadlineAt)}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${shift.chaos}%`,
                          background: shift.chaos > 70 ? "#ef4444" : shift.chaos > 35 ? "#f59e0b" : "#22c55e",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{shift.chaos}</span>
                  </div>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Tips: {shift.tipsTokens} tokens</span>
                    <span>SFX left: {shift.sfxAllowanceRemaining}</span>
                  </div>

                  {shift.takeoverShieldedUntil && new Date(shift.takeoverShieldedUntil).getTime() > Date.now() && (
                    <p className="mt-1 text-[10px] font-bold text-cyan-300">
                      Protected {formatCountdown(shift.takeoverShieldedUntil)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-black/80 p-3 border border-white/10 text-center text-sm text-slate-300">
                  No one's behind the bar right now — the next person in the queue takes over shortly.
                </div>
              )}

              {isBartender && snapshot.chits.length > 0 && (
                <div className="rounded-lg bg-black/80 p-3 border border-white/10">
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-300">Orders</p>
                  <div className="flex flex-col gap-2">
                    {snapshot.chits.map((chit) => (
                      <div key={chit.id} className="rounded bg-[#181a1f] p-2 border border-white/10">
                        <p className="text-xs text-slate-200">{chit.dialogue}</p>
                        <div className="mt-1.5 flex gap-1.5">
                          {chitResponseOptions(chit).map((opt) => (
                            <ConsoleButton
                              key={opt.key}
                              variant="orange"
                              disabled={busy === `chit:${chit.id}`}
                              className="!py-1 text-[11px]"
                              onClick={() =>
                                withBusy(`chit:${chit.id}`, async () => {
                                  await resolveTavernChitAction(chit.id, opt.key);
                                })
                              }
                            >
                              {opt.label}
                            </ConsoleButton>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isBartender && snapshot.sfxOptions.length > 0 && (
                <div className="rounded-lg bg-black/80 p-3 border border-white/10">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-300">
                    <Volume2 className="h-3.5 w-3.5" /> Safe-Room SFX
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {snapshot.sfxOptions.map((opt) => (
                      <ConsoleButton
                        key={opt.soundKey}
                        variant="gray"
                        disabled={busy === "sfx" || shift.sfxAllowanceRemaining <= 0}
                        className="!py-1 text-[11px]"
                        onClick={() =>
                          withBusy("sfx", async () => {
                            await triggerTavernSfxAction(opt.soundKey);
                          })
                        }
                      >
                        {opt.name}
                      </ConsoleButton>
                    ))}
                  </div>
                </div>
              )}

              {snapshot.mutiny && (
                <div className="rounded-lg bg-red-950/60 p-3 border border-red-500/40">
                  <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-red-300">
                    <Swords className="h-3.5 w-3.5" /> Mutiny in progress
                  </p>
                  <p className="mt-1 text-[11px] text-red-200">
                    Ends in {formatCountdown(snapshot.mutiny.voteDeadlineAt)}
                  </p>
                  {signedIn && !snapshot.mutiny.myVote ? (
                    <div className="mt-2 flex gap-1.5">
                      <ConsoleButton
                        variant="red"
                        disabled={busy === "vote"}
                        className="!py-1 text-[11px]"
                        onClick={() =>
                          withBusy("vote", async () => {
                            await castTavernMutinyVoteAction(snapshot.mutiny!.id, "overturn");
                          })
                        }
                      >
                        Overturn
                      </ConsoleButton>
                      <ConsoleButton
                        variant="gray"
                        disabled={busy === "vote"}
                        className="!py-1 text-[11px]"
                        onClick={() =>
                          withBusy("vote", async () => {
                            await castTavernMutinyVoteAction(snapshot.mutiny!.id, "defend");
                          })
                        }
                      >
                        Defend
                      </ConsoleButton>
                    </div>
                  ) : snapshot.mutiny.myVote ? (
                    <p className="mt-1.5 text-[10px] text-red-300">You voted: {snapshot.mutiny.myVote}</p>
                  ) : null}
                </div>
              )}

              {!signedIn ? (
                <ConsoleButton variant="orange" className="w-full !py-2" onClick={onOpenSignIn}>
                  Sign in to join the Tavern
                </ConsoleButton>
              ) : (
                <div className="flex items-center justify-between rounded-lg bg-black/80 p-3 border border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <Users className="h-3.5 w-3.5" />
                    {inQueue ? `You're #${queuePosition} in line` : `${snapshot.queueLength} waiting`}
                  </div>
                  <div className="flex gap-1.5">
                    {!isBartender && (
                      <ConsoleButton
                        variant={inQueue ? "gray" : "orange"}
                        disabled={busy === "queue"}
                        className="!py-1 text-[11px]"
                        onClick={() =>
                          withBusy("queue", async () => {
                            if (inQueue) await leaveTavernQueueAction();
                            else await joinTavernQueueAction();
                          })
                        }
                      >
                        {inQueue ? "Leave line" : "Get in line"}
                      </ConsoleButton>
                    )}
                    {canMutiny && (
                      <ConsoleButton
                        variant="red"
                        disabled={busy === "mutiny"}
                        className="!py-1 text-[11px]"
                        onClick={() => withBusy("mutiny", async () => { await startTavernMutinyAction(); })}
                      >
                        Start mutiny
                      </ConsoleButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

export default TavernPanel;
