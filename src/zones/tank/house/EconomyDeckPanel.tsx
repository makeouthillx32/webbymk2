"use client";

import React, { useState, useEffect } from "react";
import {
  Dices,
  RefreshCw,
  Sparkles,
  Coins,
  Flame,
  Award,
  Radio,
  Gamepad2,
  TrendingUp,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import {
  getLiveRngEvents,
  type RngLiveEvent,
} from "../server/adminDeskActions";

export function EconomyDeckPanel() {
  const [events, setEvents] = useState<RngLiveEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    try {
      const data = await getLiveRngEvents();
      setEvents(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    void loadEvents();
    const interval = setInterval(() => void loadEvents(), 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      {/* ═══════════ LIVE RNG MINI-GAMES FEED ═══════════ */}
      <ChromePanel
        withScrews
        className="shadow-2xl"
        contentClassName="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded border border-amber-500/40 bg-amber-950/40 text-amber-400 shadow-inner">
              <Dices className="h-4 w-4" />
            </div>
            <div>
              <h2
                className="text-sm font-black uppercase tracking-wider text-white"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Live House RNG & Mini-Games Activity
              </h2>
              <p className="text-xs text-slate-400">
                Real-time dice rolls, slot spins, coinflips, Russian roulette, and crate unboxing drops.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadEvents()}
            className="flex items-center gap-1.5 rounded border border-black/80 bg-black/60 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-300 hover:border-yellow-400/60 hover:text-white"
            style={{ fontFamily: ACTIVE_THEME.fonts.label }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-amber-400" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {events.length === 0 ? (
          <div className="rounded border border-white/5 bg-black/50 p-6 text-center">
            <p className="text-xs font-medium text-slate-400 italic">
              No RNG mini-game events recorded recently.
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="flex items-center justify-between gap-3 rounded border border-black/80 bg-[#16181d]/90 p-2.5 shadow-inner"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-yellow-400">
                      @{evt.userName}
                    </span>
                    <span className="rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.2 text-[8px] font-black uppercase">
                      {evt.messageType}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">
                      #{evt.roomId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 mt-0.5 font-medium">{evt.body}</p>
                </div>
                <span className="text-[9px] text-slate-400 whitespace-nowrap font-mono">
                  {evt.time}
                </span>
              </div>
            ))}
          </div>
        )}
      </ChromePanel>

      {/* ═══════════ MULTIPLIERS & DROP TIERS ═══════════ */}
      <div className="grid gap-4 sm:grid-cols-3">
        <ChromePanel withScrews contentClassName="space-y-2">
          <div className="flex items-center gap-2 border-b border-black/80 pb-2">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            <h3
              className="text-xs font-black uppercase text-white"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Casino Slots Multiplier
            </h3>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-300">3x 👑 Jackpots</span>
              <strong className="text-amber-400">50x Payout</strong>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-300">3x 💎 Diamonds</span>
              <strong className="text-cyan-400">25x Payout</strong>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-300">3x 🍒 Cherries</span>
              <strong className="text-red-400">5x Payout</strong>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="text-slate-400">Rare Item Drop Chance</span>
              <strong className="text-emerald-400">12%</strong>
            </div>
          </div>
        </ChromePanel>

        <ChromePanel withScrews contentClassName="space-y-2">
          <div className="flex items-center gap-2 border-b border-black/80 pb-2">
            <Award className="h-4 w-4 text-purple-400" />
            <h3
              className="text-xs font-black uppercase text-white"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Loot Drop Tiers
            </h3>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-amber-300">Legendary (Deed, Saber)</span>
              <strong className="text-amber-400">2%</strong>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-purple-300">Epic (Jelly, Master Key)</span>
              <strong className="text-purple-400">8%</strong>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-blue-300">Rare (Didgeridoo, Mask)</span>
              <strong className="text-blue-400">20%</strong>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="text-slate-400">Common (Monitor, Gloves)</span>
              <strong className="text-slate-300">70%</strong>
            </div>
          </div>
        </ChromePanel>

        <ChromePanel withScrews contentClassName="space-y-2">
          <div className="flex items-center gap-2 border-b border-black/80 pb-2">
            <Radio className="h-4 w-4 text-sky-400" />
            <h3
              className="text-xs font-black uppercase text-white"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Broadcast Action Engine
            </h3>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-300">RNG Broadcast Frequency</span>
              <strong className="text-yellow-400">Instant</strong>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-slate-300">Target Chat Room</span>
              <strong className="text-white">Global & Room</strong>
            </div>
            <div className="flex justify-between pt-0.5">
              <span className="text-slate-400">Attribution</span>
              <strong className="text-emerald-400">HOUSE (System Action)</strong>
            </div>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
