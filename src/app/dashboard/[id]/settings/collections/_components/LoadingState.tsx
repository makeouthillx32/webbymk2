// app/settings/collections/_components/LoadingState.tsx
"use client";

export function LoadingState({ label = "Loading collections..." }: { label?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--foreground))]" />
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
      </div>

      <div className="mt-4 space-y-2">
        <div className="h-10 w-full animate-pulse rounded-[var(--radius)] bg-[hsl(var(--muted))]" />
        <div className="h-10 w-full animate-pulse rounded-[var(--radius)] bg-[hsl(var(--muted))]" />
        <div className="h-10 w-full animate-pulse rounded-[var(--radius)] bg-[hsl(var(--muted))]" />
      </div>
    </div>
  );
}