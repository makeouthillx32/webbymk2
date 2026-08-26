"use client";

import React, { useState } from "react";
import { KeyRound, Lock, Sparkles, Trophy, X, Zap } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ConsoleButton } from "./ConsoleButton";
import { ACTIVE_THEME } from "../../theme";
import { redeemSecretCodeAction, type CodeRedemptionResult } from "../../server/rewardsSystem";

export type SecretCodeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (res: CodeRedemptionResult) => void;
};

export function SecretCodeModal({ isOpen, onClose, onSuccess }: SecretCodeModalProps) {
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState<CodeRedemptionResult | null>(null);

  if (!isOpen) return null;

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || redeeming) return;

    setRedeeming(true);
    setResult(null);

    try {
      const res = await redeemSecretCodeAction(code, "viewer-self");
      setResult(res);
      if (res.success && onSuccess) {
        onSuccess(res);
      }
    } catch {
      setResult({ success: false, error: "Failed to redeem code." });
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Secret Event Code"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-sm flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 shadow-[0_12px_40px_rgba(0,0,0,0.9)]"
      >
        <ChromePanel
          withScrews
          className="flex h-full w-full flex-col overflow-hidden shadow-2xl"
          contentClassName="!p-0 flex flex-1 flex-col overflow-hidden"
        >
          {/* Top Header Strip with Red Close Button */}
          <div className="relative flex items-center justify-between border-b border-black/40 px-8 py-3.5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-yellow-400" />
              <h2
                className="text-xs font-black uppercase tracking-widest text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Secret Cipher Input
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-8 py-4 space-y-3.5 select-none">
            {/* Arcade Banner */}
            <div className="rounded border border-black/60 bg-black/90 p-3.5 text-center shadow-inner relative overflow-hidden">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#eab308_1px,transparent_1px)] opacity-10 [background-size:8px_8px]" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-b from-amber-400 to-orange-600 border border-yellow-300 text-black shadow-md mb-2">
                  <Lock className="h-6 w-6 stroke-[2.5]" />
                </div>
                <h3
                  className="text-sm font-black uppercase tracking-wider text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  Event Code Terminal
                </h3>
                <p className="text-[11px] text-slate-300 font-medium mt-0.5">
                  Enter promotional or broadcast codes for instant loot drops.
                </p>
              </div>
            </div>

            {/* Recessed Form */}
            <form onSubmit={handleRedeem} className="space-y-3">
              <div className="rounded border border-black/60 bg-black/90 p-2 shadow-inner">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="E.G. LAUNCH2026"
                  disabled={redeeming}
                  className="w-full bg-transparent px-2 py-1.5 text-center font-mono text-base font-black tracking-widest text-yellow-400 uppercase placeholder:text-slate-600 focus:outline-none"
                />
              </div>

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
                      <p className="font-black text-sm text-yellow-400 flex items-center justify-center gap-1.5">
                        <Sparkles className="h-4 w-4" /> {result.message}
                      </p>
                      <p className="mt-1 text-slate-200">
                        +{result.xpAwarded} XP · +{result.tokensAwarded} Tokens
                        {result.itemAwarded ? ` · Item: ${result.itemAwarded}` : ""}
                      </p>
                    </div>
                  ) : (
                    <p>{result.error}</p>
                  )}
                </div>
              )}

              <ConsoleButton
                variant="orange"
                type="submit"
                disabled={redeeming || !code.trim()}
                className="w-full !py-2.5 text-sm !font-black"
              >
                {redeeming ? "Validating Cipher..." : "Decrypt & Unlock Loot"}
              </ConsoleButton>
            </form>

            <div className="rounded border border-white/5 bg-black/40 p-2 text-center text-[10px] text-slate-400 font-mono">
              💡 Hint: Try code <strong className="text-yellow-400 font-black">LAUNCH2026</strong> for founder loot!
            </div>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

export default SecretCodeModal;
