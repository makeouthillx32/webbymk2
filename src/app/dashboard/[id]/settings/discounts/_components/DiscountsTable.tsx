// app/settings/discounts/_components/DiscountsTable.tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";

export type DiscountRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed_amount";
  percent_off: number | null;
  amount_off_cents: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  max_uses?: number | null;
  uses_count?: number;
};

function formatValue(row: DiscountRow) {
  if (row.type === "percentage") return `${row.percent_off ?? 0}%`;
  const cents = row.amount_off_cents ?? 0;
  return `$${(cents / 100).toFixed(2)}`;
}

export function DiscountsTable({
  discounts,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  discounts: DiscountRow[];
  onEdit: (row: DiscountRow) => void;
  onDelete: (row: DiscountRow) => void;
  onToggleActive: (row: DiscountRow, active: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {discounts.map((d) => (
        <div
          key={d.id}
          className="flex items-center justify-between rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">
              {d.code}
              <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                {formatValue(d)}
              </span>
            </p>

            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {d.max_uses != null
                ? `Uses: ${d.uses_count ?? 0} / ${d.max_uses}`
                : `Uses: ${d.uses_count ?? 0} / ∞`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
              <input
                type="checkbox"
                checked={!!d.is_active}
                onChange={(e) => onToggleActive(d, e.target.checked)}
                className="h-4 w-4 rounded border-[hsl(var(--border))]"
              />
              Active
            </label>

            <button
              type="button"
              onClick={() => onEdit(d)}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(d)}
              className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
            >
              <Trash2 className="h-4 w-4 text-[hsl(var(--destructive))]" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}