"use client";
// components/dashboard/FilterTabs.tsx
// Segmented filter control — replaces a <select> when there are few options and
// the current one is worth showing at a glance. Generic over the value type.

import { cn } from "@/utils/cn";

export interface FilterTabOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count badge. */
  count?: number;
}

export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel = "Filter",
}: {
  value: T;
  options: FilterTabOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-10 items-center gap-1 rounded-[var(--radius)] border border-[hsl(var(--border))] p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-primary text-[hsl(var(--primary-foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            )}
          >
            {option.label}
            {typeof option.count === "number" ? (
              <span className={cn("text-xs", active ? "opacity-80" : "opacity-70")}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
