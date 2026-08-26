"use client";

import React, { useState } from "react";
import { Sparkles, Trophy, X, Zap, Coins, Dices, Gift } from "lucide-react";
import {
  PRIZE_WHEEL_DROPS,
  spinPrizeMachineAction,
  type PrizeWheelItem,
  type SpinResult,
} from "../../server/rewardsSystem";

export type PrizeMachineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userTokens?: number;
  onPrizeWon?: (prize: PrizeWheelItem) => void;
};

export function PrizeMachineModal({
  isOpen,
  onClose,
  userTokens = 50,
  onPrizeWon,
}: PrizeMachineModalProps) {
  const [spinning, setSpinning] = useState(false);
  const [currentIcon, setCurrentIcon] = useState("🪙");
  const [wonPrize, setWonPrize] = useState<PrizeWheelItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSpin = async () => {
    if (spinning) return;
    setError(null);
    setWonPrize(null);
    setSpinning(true);

    // Slot machine rolling animation cycle
    const icons = ["🗡️", "🥽", "🪙", "⚡", "🎁", "⭐"];
    let counter = 0;
    const interval = setInterval(() => {
      setCurrentIcon(icons[counter % icons.length]);
      counter++;
    }, 90);

    try {
      const res = await spinPrizeMachineAction("viewer-self", false);

      setTimeout(() => {
        clearInterval(interval);
        setSpinning(false);

        if (res.success && res.prize) {
          setCurrentIcon(res.prize.icon);
          setWonPrize(res.prize);
          if (onPrizeWon) onPrizeWon(res.prize);
        } else {
          setError(res.error || "Failed to spin.");
        }
      }, 1800);
    } catch {
      clearInterval(interval);
      setSpinning(false);
      setError("Network error spinning prize machine.");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-sm rounded-3xl bg-[#e7e5d2] text-[#22241b] p-6 shadow-2xl border-4 border-[#dedbc4] select-none text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-xl bg-[#e65947] hover:bg-[#d44837] text-white shadow active:scale-95"
        >
          <X className="h-5 w-5 stroke-[2.5]" />
        </button>

        {/* Title */}
        <div className="pt-2 pb-3">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#60a5fa] to-[#2563eb] text-white shadow-lg mb-2">
            <Sparkles className="h-7 w-7 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-[#1b1c15]">
            Prize Machine
          </h2>
          <p className="text-xs text-[#606354] font-medium">
            Spin to win rare items, token stashes & XP surges!
          </p>
        </div>

        {/* Slot Reel Box */}
        <div className="relative my-4 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-[#1b1c16] via-black to-[#1b1c16] border-4 border-[#ca8a04] p-6 shadow-[inset_0_4px_12px_rgba(0,0,0,0.8),0_0_20px_rgba(202,138,4,0.3)]">
          <div className={`text-6xl my-2 transition-transform duration-75 ${spinning ? "scale-110 animate-bounce" : ""}`}>
            {currentIcon}
          </div>

          <div className="mt-2 text-xs font-black uppercase tracking-widest text-[#fde047]">
            {spinning ? "SPINNING REELS..." : wonPrize ? wonPrize.name : "READY TO ROLL"}
          </div>
        </div>

        {/* Won Prize Announcement Card */}
        {wonPrize && (
          <div className="my-3 p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border border-yellow-500/50 text-xs font-bold text-[#1b1c15] animate-in zoom-in-95">
            <p className="font-black text-sm text-[#b45309] uppercase tracking-wide">
              🎉 PRIZE WON: {wonPrize.name}!
            </p>
            <p className="text-[11px] text-[#451a03] mt-0.5">
              Rarity: <span className="uppercase font-black text-amber-700">{wonPrize.rarity}</span> · Added to your account.
            </p>
          </div>
        )}

        {error && <p className="text-xs font-bold text-red-600 my-2">{error}</p>}

        {/* Spin Action Button */}
        <button
          onClick={handleSpin}
          disabled={spinning}
          className="w-full mt-2 rounded-xl bg-gradient-to-b from-[#2563eb] to-[#1d4ed8] hover:from-[#3b82f6] hover:to-[#2563eb] py-3 text-center text-sm font-black uppercase tracking-wider text-white shadow-lg active:scale-95 transition disabled:opacity-50"
        >
          {spinning ? "Rolling Wheels..." : "Spin Machine (20 Tokens)"}
        </button>

        {/* Drop Rates Preview */}
        <div className="mt-4 pt-3 border-t border-[#c4c2af]/80 flex justify-around text-[10px] font-bold text-[#606354]">
          <span>🌟 Legendary: 5%</span>
          <span>🥽 Rare: 15%</span>
          <span>⚡ Common: 80%</span>
        </div>
      </div>
    </div>
  );
}
