"use client";
// components/dashboard/PageHeader.tsx
// Title + description on the left, controls on the right. Every dashboard CRUD
// screen opens this way; keeping it here stops the spacing from drifting.

import * as React from "react";
import { cn } from "@/utils/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-[hsl(var(--foreground))]">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
