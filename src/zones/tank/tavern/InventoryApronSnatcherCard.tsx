"use client";

// Tank Tavern — confirmation screen shown when a player uses an Apron
// Snatcher from their inventory. Names the Bartender who'll be displaced
// before committing (irreversible: ends their shift on the spot), matches
// the destructive-action confirmation pattern used elsewhere in Tank.

import React, { useEffect, useState } from "react";
import { X, Crown, AlertTriangle } from "lucide-react";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { ACTIVE_THEME } from "../theme";
import type { TavernSnapshot } from "../tavernTypes";
import { useApronSnatcherAction } from "../server/tavernInventoryActions";

export type InventoryApronSnatcherCardProps = {
  quantity: number;
  onClose: () => void;
  onUsed: () => void;
};

export function InventoryApronSnatcherCard({ quantity, onClose, onUsed }: InventoryApronSnatcherCardProps) {
  const [snapshot, setSnapshot] = useState<TavernSnapshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tank/tavern")
      .then((r) => r.json())
      .then((data: TavernSnapshot) => { if (!cancelled) setSnapshot(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const shift = snapshot?.shift ?? null;
  const shielded = !!shift?.takeoverShieldedUntil && new Date(shift.takeoverShieldedUntil).getTime() > Date.now();

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      const key = `apron-snatcher:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const res = await useApronSnatcherAction(key);
      if (res.success) {
        onUsed();
      } else {
        setError(res.error ?? "Couldn't snatch the Apron.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Use Apron Snatcher"
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">
        <ChromePanel withScrews className="w-full flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-black/40 pb-2 px-1">
            <h2
              className="text-sm font-black uppercase tracking-wider text-white"
              style={{ fontFamily: ACTIVE_THEME.fonts.label }}
            >
              Apron Snatcher
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="grid h-7 w-7 place-items-center rounded bg-[#e85a4f] text-white border border-white/40"
            >
              <X className="h-3.5 w-3.5 stroke-[3]" />
            </button>
          </div>

          <div className="my-2 rounded-lg bg-black/80 p-3 border border-purple-500/40 text-white">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-purple-300">
              Mythic · Owned ×{quantity}
            </p>
            <p className="mt-1.5 text-xs text-slate-300">
              Ends the current Bartender's shift on the spot and starts a fresh one for you. Up to 5 copies can be
              held at once.
            </p>

            {shift ? (
              <div className="mt-2 flex items-center gap-1.5 rounded bg-[#181a1f] px-2 py-1.5 border border-white/10">
                <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: "#b45309" }} />
                <span className="text-xs font-bold text-white">You'll displace {shift.bartenderName}</span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-amber-300">No one is currently behind the bar to steal from.</p>
            )}

            {shielded && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-cyan-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                This shift is still protected — you can't steal it yet.
              </p>
            )}

            {error && <p className="mt-2 text-[11px] font-bold text-red-400">{error}</p>}
          </div>

          <div className="flex gap-2">
            <ConsoleButton variant="gray" className="flex-1 !py-1.5" onClick={onClose} disabled={submitting}>
              Cancel
            </ConsoleButton>
            <ConsoleButton
              variant="red"
              className="flex-1 !py-1.5"
              onClick={handleConfirm}
              disabled={submitting || !shift || shielded}
            >
              {submitting ? "Snatching…" : "Snatch the Apron"}
            </ConsoleButton>
          </div>
        </ChromePanel>
      </div>
    </div>
  );
}

export default InventoryApronSnatcherCard;
