// app/settings/creators/_components/CreatorsTable.tsx
"use client";

import { Pencil, Pause, Play } from "lucide-react";

export type CreatorRow = {
  id: string;
  status: "active" | "paused" | "removed";
  balance_cents: number;
  lifetime_earned_cents: number;
  lifetime_paid_cents: number;
  cashout_threshold_cents: number;
  notes: string | null;
  created_at: string;
  profiles: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  creator_tiers: { id: string; name: string; percent_off: number } | null;
  discounts: { id: string; code: string; is_active: boolean; percent_off: number | null; uses_count?: number } | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function displayName(row: CreatorRow) {
  const p = row.profiles;
  if (!p) return "Unknown profile";
  const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return full || p.display_name || p.email || p.id;
}

export function CreatorsTable({
  creators,
  onEdit,
  onToggleStatus,
}: {
  creators: CreatorRow[];
  onEdit: (row: CreatorRow) => void;
  onToggleStatus: (row: CreatorRow) => void;
}) {
  if (creators.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        No creators yet. Turn an existing profile into a creator to get started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {creators.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
              {displayName(c)}
              <span className="ml-2 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                {c.creator_tiers?.name ?? "—"} · {c.creator_tiers?.percent_off ?? 0}%
              </span>
              {c.status !== "active" && (
                <span className="ml-2 rounded-full bg-[hsl(var(--destructive))]/10 px-2 py-0.5 text-xs font-normal text-[hsl(var(--destructive))]">
                  {c.status}
                </span>
              )}
            </p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Code <span className="font-mono">{c.discounts?.code ?? "—"}</span> · Uses: {c.discounts?.uses_count ?? 0}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-[hsl(var(--muted-foreground))]">
            <div className="text-right">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{money(c.balance_cents)}</p>
              <p>Balance</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{money(c.lifetime_earned_cents)}</p>
              <p>Earned</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{money(c.lifetime_paid_cents)}</p>
              <p>Paid out</p>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onToggleStatus(c)}
                title={c.status === "active" ? "Pause" : "Resume"}
                className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
              >
                {c.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
