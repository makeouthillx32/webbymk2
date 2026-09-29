"use client";

import { Loader2 } from "lucide-react";

export default function LoadingState({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-8 text-sm text-[hsl(var(--muted-foreground))]">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
