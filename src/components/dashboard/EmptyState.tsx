"use client";
// components/dashboard/EmptyState.tsx
// Shown when a list has no rows — or no rows matching the current filter.

import * as React from "react";
import { cn } from "@/utils/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {icon ? <div className="mb-3 text-[hsl(var(--muted-foreground))]">{icon}</div> : null}
      <p className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
