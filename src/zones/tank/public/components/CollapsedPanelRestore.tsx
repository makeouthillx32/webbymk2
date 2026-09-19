"use client";

import React from "react";
import { Plus } from "lucide-react";

export type CollapsedPanelRestoreProps = {
  label: string;
  side: "left" | "right";
  onRestore: () => void;
};

export function CollapsedPanelRestore({
  label,
  side,
  onRestore,
}: CollapsedPanelRestoreProps) {
  return (
    <div
      className="flex h-full min-h-56 w-full items-end justify-center pb-2"
      aria-label={`${label} collapsed`}
    >
      <button
        type="button"
        onClick={onRestore}
        className={`grid place-items-center border border-black/75 bg-gradient-to-b from-[#626a72] to-[#343a40] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_5px_12px_rgba(0,0,0,.65)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 ${
          side === "left"
            ? "h-12 w-12 rounded-full"
            : "h-9 w-9 rounded-xl"
        }`}
        title={`Show ${label}`}
        aria-label={`Show ${label}`}
      >
        <Plus
          className={side === "left" ? "h-6 w-6" : "h-4 w-4"}
          strokeWidth={2.5}
        />
      </button>
    </div>
  );
}
