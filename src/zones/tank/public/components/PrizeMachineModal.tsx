"use client";

import { useState, useRef, useEffect } from "react";
import { X, Sparkles, Coins } from "lucide-react";
import { ChromePanel } from "./ChromePanel";
import { ACTIVE_THEME } from "../../theme";
import { spinTankPrizeMachine, type PrizeReelSlot } from "../../server/actions";
import { getRarityPresentation } from "../../itemRarity";

export type PrizeMachineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  userTokens?: number;
  onSpent?: (newBalance: number) => void;
};

const SPIN_COST = 50;
const ITEM_WIDTH = 84; // box + gap, must match the inline widths below
const LOOPS = 5; // how many full copies of the reel we render for scroll distance
const LANDING_LOOP = 3; // which copy index (0-based) the winning slot lands in

export function PrizeMachineModal({ isOpen, onClose, userTokens = 0, onSpent }: PrizeMachineModalProps) {
  const [spinning, setSpinning] = useState(false);
  const [reel, setReel] = useState<PrizeReelSlot[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [transitionOn, setTransitionOn] = useState(false);
  const [wonName, setWonName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Center the (still unresolved) reel on load so the strip isn't flush left.
  useEffect(() => {
    if (isOpen && reel === null) {
      setOffset(0);
      setTransitionOn(false);
    }
  }, [isOpen, reel]);

  if (!isOpen) return null;

  const handlePull = async () => {
    if (spinning) return;
    setError(null);
    setWonName(null);
    setSpinning(true);

    const res = await spinTankPrizeMachine();
    if (!res.success || !res.reel || res.winningIndex === undefined) {
      setError(res.error || "Failed to spin.");
      setSpinning(false);
      return;
    }

    setReel(res.reel);
    const viewportWidth = viewportRef.current?.offsetWidth ?? 380;
    const targetIndex = LANDING_LOOP * res.reel.length + res.winningIndex;
    const targetOffset = targetIndex * ITEM_WIDTH + ITEM_WIDTH / 2 - viewportWidth / 2;

    // Jump instantly to a neutral start (no transition), then animate to the
    // target on the next frame — otherwise the browser tweens from wherever
    // the strip happened to be left after the previous spin.
    setTransitionOn(false);
    setOffset(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionOn(true);
        setOffset(targetOffset);
      });
    });

    window.setTimeout(() => {
      setSpinning(false);
      setWonName(res.wonName ?? null);
      if (typeof res.newTokens === "number") onSpent?.(res.newTokens);
    }, 2600);
  };

  const displayReel: PrizeReelSlot[] = reel ?? [];
  const repeated: PrizeReelSlot[] = Array.from({ length: LOOPS }, () => displayReel).flat();

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-3 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Prize Machine"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md shadow-[0_12px_40px_rgba(0,0,0,0.9)]">
        <ChromePanel withScrews className="w-full flex flex-col overflow-hidden" contentClassName="!p-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-black/40 px-4 py-3">
            <h2
              className="flex items-center gap-2 text-lg font-black uppercase tracking-wider text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              <Sparkles className="h-5 w-5 text-amber-400" /> Prize Machine
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded border border-white/40 bg-[#e85a4f] text-white shadow hover:scale-105 active:scale-95"
            >
              <X className="h-4 w-4 stroke-[3]" />
            </button>
          </div>

          <div className="p-4">
            <div className="flex items-stretch gap-3">
              {/* Reel */}
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border-2 border-black/80 bg-[#0a0b0d] shadow-inner">
                {/* Center indicator */}
                <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2">
                  <div className="h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-amber-400 drop-shadow" />
                </div>
                <div className="pointer-events-none absolute bottom-0 left-1/2 top-2 z-10 w-[2px] -translate-x-1/2 bg-amber-400/40" />

                <div ref={viewportRef} className="overflow-hidden py-3">
                  <div
                    ref={trackRef}
                    className="flex gap-3 pl-3"
                    style={{
                      transform: `translateX(${-offset}px)`,
                      transition: transitionOn ? "transform 2.4s cubic-bezier(0.12, 0.85, 0.13, 1)" : "none",
                    }}
                  >
                    {(repeated.length > 0 ? repeated : Array.from({ length: 8 })).map((slot, i) => {
                      const s = slot as PrizeReelSlot | undefined;
                      const presentation = getRarityPresentation(s?.rarity);
                      return (
                        <div
                          key={i}
                          className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg border-2 bg-[#161a23] p-1 ${presentation.border} ${presentation.glow}`}
                        >
                          {s?.iconUrl ? (
                            <img src={s.iconUrl} alt={s.name} className="h-9 w-9 object-contain" />
                          ) : (
                            <div className="h-9 w-9 rounded bg-white/5" />
                          )}
                          <span className="mt-0.5 w-full truncate text-center text-[8px] font-bold text-slate-300">
                            {s?.name ?? ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Lever */}
              <button
                type="button"
                onClick={handlePull}
                disabled={spinning || userTokens < SPIN_COST}
                aria-label="Pull lever"
                className="group flex w-11 shrink-0 flex-col items-center rounded-xl border-2 border-black/80 bg-[#161a23] py-2 shadow-inner disabled:opacity-40"
              >
                <div className="relative flex h-full w-2 flex-1 items-start justify-center rounded-full bg-black/70">
                  <div
                    className={`h-6 w-6 rounded-full border-2 border-amber-300 bg-gradient-to-b from-amber-400 to-amber-600 shadow-lg transition-transform duration-300 ${
                      spinning ? "translate-y-[70px]" : "translate-y-0 group-active:translate-y-4"
                    }`}
                  />
                </div>
              </button>
            </div>

            {/* Won banner */}
            {wonName && !spinning && (
              <div className="mt-3 rounded-lg border border-amber-400/50 bg-amber-400/10 p-2 text-center animate-in zoom-in-95">
                <p className="text-xs font-black uppercase tracking-wide text-amber-300">🎉 Won: {wonName}!</p>
              </div>
            )}
            {error && <p className="mt-2 text-center text-xs font-bold text-red-400">{error}</p>}
            {userTokens < SPIN_COST && !error && (
              <p className="mt-2 text-center text-xs font-bold text-red-400">
                Not enough tokens — need {SPIN_COST}.
              </p>
            )}

            {/* Balance / Cost */}
            <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/40 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Coins className="h-3.5 w-3.5 text-amber-400" /> Balance
                <span className="font-black text-white">{userTokens}</span>
              </div>
              <div className="text-xs font-bold text-slate-300">
                Cost <span className="font-black text-amber-300">{SPIN_COST}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePull}
              disabled={spinning || userTokens < SPIN_COST}
              className="mt-3 w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 py-2.5 text-center text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:from-amber-300 hover:to-amber-500 active:scale-95 disabled:opacity-50"
            >
              {spinning ? "Spinning..." : `Pull Lever (${SPIN_COST} Tokens)`}
            </button>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

export default PrizeMachineModal;
