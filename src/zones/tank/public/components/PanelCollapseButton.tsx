"use client";

import { Minus, Plus } from "lucide-react";

type PanelCollapseButtonProps = {
  title: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

export function PanelCollapseButton({
  title,
  expanded,
  onExpandedChange,
}: PanelCollapseButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onExpandedChange(!expanded)}
      className="grid h-6 w-6 shrink-0 place-items-center rounded border border-red-950/70 bg-[#d94339] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)] transition hover:bg-[#ef5146] active:translate-y-px"
      title={expanded ? `Collapse ${title}` : `Expand ${title}`}
      aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
      aria-expanded={expanded}
    >
      {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
    </button>
  );
}
