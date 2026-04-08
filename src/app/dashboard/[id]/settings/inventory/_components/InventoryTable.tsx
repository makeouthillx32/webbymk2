// app/settings/inventory/_components/InventoryTable.tsx
"use client";

import { Pencil } from "lucide-react";

export type InventoryRow = {
  inventory_id: string;
  variant_id: string;

  product_title: string | null;
  variant_title: string | null;
  sku: string | null;

  quantity: number | null;
  track_inventory: boolean;
  allow_backorder: boolean;

  updated_at: string | null;
};

function pill(text: string, tone: "ok" | "warn" | "bad") {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-none";
  const toneCls =
    tone === "ok"
      ? "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]"
      : tone === "warn"
      ? "border-[hsl(var(--border))] text-[hsl(var(--primary))]"
      : "border-[hsl(var(--destructive))] text-[hsl(var(--destructive))]";
  return <span className={`${base} ${toneCls}`}>{text}</span>;
}

export function InventoryTable({
  rows,
  lowStockThreshold,
  onEdit,
}: {
  rows: InventoryRow[];
  lowStockThreshold: number;
  onEdit: (row: InventoryRow) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const qty = r.quantity ?? 0;
        const isTracked = !!r.track_inventory;
        const isLow = isTracked && qty <= lowStockThreshold;
        const isOOS = isTracked && qty <= 0 && !r.allow_backorder;

        return (
          <div
            key={r.inventory_id}
            className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
                {r.product_title ?? "Untitled Product"}
                <span className="ml-2 text-xs font-normal text-[hsl(var(--muted-foreground))]">
                  {r.variant_title ? `• ${r.variant_title}` : ""}
                </span>
              </p>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  SKU: {r.sku ?? "—"}
                </span>

                {isTracked ? pill("Tracked", "ok") : pill("Not Tracked", "warn")}
                {r.allow_backorder ? pill("Backorder OK", "warn") : pill("No Backorder", "ok")}

                {isOOS ? pill("Out of stock", "bad") : isLow ? pill("Low stock", "warn") : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Quantity</p>
                <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {isTracked ? qty : "∞"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onEdit(r)}
                className="rounded-[var(--radius)] p-1.5 hover:bg-[hsl(var(--muted))]"
                aria-label="Edit inventory"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}