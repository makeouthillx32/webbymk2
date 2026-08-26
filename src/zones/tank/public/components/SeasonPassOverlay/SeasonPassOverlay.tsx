"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Backpack,
  Check,
  Clapperboard,
  Coins,
  DollarSign,
  Gift,
  HandCoins,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  Moon,
  Radio,
  Send,
  Shield,
  Sparkles,
  Store,
  Trophy,
  Tv,
  Volume2,
  X,
  Zap,
  Crown,
  CheckCircle2,
} from "lucide-react";
import type { BillingCycle, SeasonPassOverlayProps, SeasonPassTier } from "./types";
import { ChromePanel } from "../ChromePanel";
import { ConsoleButton } from "../ConsoleButton";
import { ACTIVE_THEME } from "../../../theme";

export function SeasonPassOverlay({
  isOpen,
  onClose,
  variant = "get",
  onSelectTier,
  onOpenProducerLounge,
}: SeasonPassOverlayProps) {
  const [billing, setBilling] = useState<BillingCycle>("monthly");

  if (!isOpen) return null;

  const handleSelect = (tier: SeasonPassTier) => {
    if (onSelectTier) {
      onSelectTier(tier, billing);
    } else {
      console.log(`[SeasonPass] Selected ${tier} (${billing})`);
    }
  };

  const isRequired = variant === "required";
  const isSixMonths = billing === "six_months";

  const standardPrice = isSixMonths ? "$50.00" : "$10.00";
  const standardSubtext = isSixMonths ? "per 6 months (Save 17%)" : "per month";
  const xlPrice = isSixMonths ? "$175.00" : "$35.00";
  const xlSubtext = isSixMonths ? "per 6 months (Save 17%)" : "per month";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Season Pass"
    >
      <div
        className="relative w-full max-w-[480px] sm:max-w-[540px] my-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-250 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl border-4 border-black/40"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* ═══════════ TOP INDUSTRIAL HEADER STRIP ═══════════ */}
          <div className="relative flex items-center justify-between border-b border-black/40 px-6 sm:px-8 py-3.5 bg-black/10">
            <div className="flex items-center gap-2">
              <div className="grid h-6 w-6 place-items-center rounded bg-orange-600 text-white shadow">
                <Crown className="h-3.5 w-3.5" />
              </div>
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                {isRequired ? "Season Pass Required" : "Tank Season Pass"}
              </h2>
            </div>

            {/* Red Corner Close Button */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-6 w-6 place-items-center rounded border border-black/40 bg-[#e85a4f] hover:bg-[#d44837] text-white shadow transition active:scale-95"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {/* Main Header Banner */}
            <div className="relative pt-1 pb-2 text-center">
              {/* Silhouette Watermark Icon */}
              <div className="absolute inset-0 -top-2 flex items-center justify-center opacity-10 pointer-events-none">
                <Crown className="w-32 h-32 text-black" />
              </div>

              <h1
                className="relative z-10 text-2xl sm:text-3xl font-black uppercase text-[#241f14] leading-tight tracking-tight drop-shadow"
                style={{ fontFamily: ACTIVE_THEME.fonts.labelWide || ACTIVE_THEME.fonts.label }}
              >
                {isRequired ? "Season Pass Required!" : "Get a Season Pass!"}
              </h1>
              <p className="relative z-10 text-xs font-bold text-[#5a5442] mt-0.5">
                Unlock 24/7 interactive controls, monthly rewards, and live house perks. Inventory stays open to every account.
              </p>
            </div>

            {/* Billing Cycle Toggle Tabs (Monthly vs 6 Months) */}
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl bg-black/20 p-1 border border-black/15 shadow-inner">
                <button
                  type="button"
                  onClick={() => setBilling("monthly")}
                  className={`rounded-lg px-4 py-1.5 text-xs font-black uppercase transition-all ${
                    billing === "monthly"
                      ? "bg-[#241f14] text-orange-400 border border-orange-500/50 shadow-md scale-100"
                      : "text-[#4c4630] hover:text-[#241f14]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBilling("six_months")}
                  className={`rounded-lg px-4 py-1.5 text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                    billing === "six_months"
                      ? "bg-[#241f14] text-orange-400 border border-orange-500/50 shadow-md scale-100"
                      : "text-[#4c4630] hover:text-[#241f14]"
                  }`}
                >
                  <span>6 Months</span>
                  <span className="rounded bg-orange-500 px-1 py-0.2 text-[8px] font-black text-black">
                    SAVE 17%
                  </span>
                </button>
              </div>
            </div>

            {/* ═══════════ TWO COMPARISON TIER CARDS ═══════════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 items-stretch">
              {/* ── TIER 1: STANDARD PASS ── */}
              <div className="flex flex-col rounded-xl bg-white/75 border-2 border-black/20 p-3.5 shadow-md hover:border-orange-500/60 hover:shadow-xl transition-all duration-200 group">
                {/* Header Action Button */}
                <button
                  type="button"
                  onClick={() => handleSelect("standard")}
                  className="w-full rounded-lg bg-gradient-to-b from-[#f26d4b] to-[#d64b27] hover:from-[#f57a5b] hover:to-[#e05430] py-2 text-center text-xs font-black uppercase tracking-wider text-white shadow-md border-t border-white/40 active:translate-y-0.5 transition"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Season Pass
                </button>

                {/* Price Display */}
                <div className="mt-2.5 pb-2 text-center border-b border-black/10">
                  <div className="text-2xl font-black text-[#241f14] tracking-tight font-mono">
                    {standardPrice}
                  </div>
                  <div className="text-[10px] text-[#5a5442] font-bold">
                    {standardSubtext}
                  </div>
                </div>

                {/* Perks List */}
                <ul className="mt-3 space-y-1.5 text-xs font-bold text-[#3a3528] leading-tight flex-1">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>Unlimited Chat & DMs</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Backpack className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>Bonus Item Storage</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Moon className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>Watch After Dark</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>100 Tokens / Month</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>10% XP Earning Bonus</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Store className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                    <span>Item Trading & Market</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => handleSelect("standard")}
                  className="mt-3 w-full rounded bg-black/10 hover:bg-black/20 py-1.5 text-center text-xs font-bold text-[#241f14] transition"
                >
                  Select Standard
                </button>
              </div>

              {/* ── TIER 2: PASS XL (VIP) ── */}
              <div className="flex flex-col rounded-xl bg-gradient-to-b from-amber-500/10 via-white/80 to-amber-500/10 border-2 border-amber-500/60 p-3.5 shadow-lg ring-1 ring-amber-400/40 hover:shadow-2xl transition-all duration-200 group relative">
                {/* VIP Ribbon Badge */}
                <div className="absolute -top-2.5 right-3 bg-amber-500 text-black px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider shadow">
                  ★ MOST POPULAR
                </div>

                {/* Header Action Button */}
                <button
                  type="button"
                  onClick={() => handleSelect("xl")}
                  className="w-full rounded-lg bg-gradient-to-b from-[#5594d4] to-[#2563eb] hover:from-[#65a1de] hover:to-[#3b82f6] py-2 text-center text-xs font-black uppercase tracking-wider text-white shadow-md border-t border-white/40 active:translate-y-0.5 transition flex items-center justify-center gap-1"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Season Pass XL
                </button>

                {/* Price Display */}
                <div className="mt-2.5 pb-2 text-center border-b border-black/10">
                  <div className="text-2xl font-black text-[#241f14] tracking-tight font-mono">
                    {xlPrice}
                  </div>
                  <div className="text-[10px] text-blue-950 font-bold">
                    {xlSubtext}
                  </div>
                </div>

                {/* Perks List */}
                <ul className="mt-3 space-y-1.5 text-xs font-bold text-[#2b2f38] leading-tight flex-1">
                  <li className="flex items-center gap-1.5 text-blue-900 font-black">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>All Standard Perks Included</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Mic className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>Priority TTS Broadcast</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Backpack className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>Expanded Item Storage</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Coins className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>350 Tokens / Month</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>25% XP Earning Bonus</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>Zero Stock Exchange Fees</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Gift className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>1 Free Daily Prize Drop</span>
                  </li>
                </ul>

                <button
                  type="button"
                  onClick={() => handleSelect("xl")}
                  className="mt-3 w-full rounded bg-blue-600 hover:bg-blue-700 py-1.5 text-center text-xs font-black text-white shadow transition"
                >
                  Select VIP XL
                </button>
              </div>
            </div>

            {/* Bottom Producer Lounge / VIP Info */}
            <div className="pt-2 border-t border-black/10 text-center">
              <p className="text-[10px] font-mono text-[#5a5442]">
                Instant activation on payment confirmation · Cancel anytime from Billing Settings
              </p>
            </div>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}
export default SeasonPassOverlay;
