"use client";
// components/dashboard/Field.tsx
// Label + control + hint/error, and the shared control styling the dashboard
// forms use. `fieldControlClass` exists so a plain <select> or <textarea> can
// match the styled <Input> without copying a 200-character class string.

import * as React from "react";
import { cn } from "@/utils/cn";

export const fieldControlClass =
  "w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

export const fieldLabelClass =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  action,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  /** Right-aligned control on the label row (e.g. a Preview toggle). */
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {(label || action) && (
        <div className="mb-1 flex items-end justify-between gap-3">
          {label ? (
            <label htmlFor={htmlFor} className={cn(fieldLabelClass, "mb-0")}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
        </div>
      )}

      {children}

      {error ? (
        <p className="mt-1 text-xs text-[hsl(var(--destructive))]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] leading-snug text-[hsl(var(--muted-foreground))]">{hint}</p>
      ) : null}
    </div>
  );
}
