import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  description?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
  description,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))]">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {description ? (
            <div className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {description}
            </div>
          ) : null}
        </div>
        <span className="text-[hsl(var(--muted-foreground))]">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
      </button>

      {open ? <div className="px-4 pb-4 pt-1">{children}</div> : null}
    </div>
  );
}