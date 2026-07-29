"use client";
// components/dashboard/SectionCard.tsx
// A titled panel for grouping form controls. Editors read far better when
// related fields sit in labelled sections instead of one long column.

import * as React from "react";
import { cn } from "@/utils/cn";

export function SectionCard({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">{title}</h3>
            ) : null}
            {description ? (
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
