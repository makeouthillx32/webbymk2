// app/settings/inventory/_components/InventoryActionBar.tsx
"use client";

import { RefreshCw, Wrench } from "lucide-react";
import { InventorySearchBar } from "./InventorySearchBar";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;

  showOnlyTracked: boolean;
  onShowOnlyTrackedChange: (v: boolean) => void;

  showLowStock: boolean;
  onShowLowStockChange: (v: boolean) => void;

  lowStockThreshold: number;
  onLowStockThresholdChange: (v: number) => void;

  onRefresh: () => void;
  onReseedMissing: () => void; // runs SQL-backed seed on page
};

export function InventoryActionBar({
  search,
  onSearchChange,
  showOnlyTracked,
  onShowOnlyTrackedChange,
  showLowStock,
  onShowLowStockChange,
  lowStockThreshold,
  onLowStockThresholdChange,
  onRefresh,
  onReseedMissing,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-md">
          <InventorySearchBar value={search} onChange={onSearchChange} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm hover:bg-[hsl(var(--muted))]"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            type="button"
            onClick={onReseedMissing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            <Wrench className="h-4 w-4" />
            Seed Missing
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            checked={showOnlyTracked}
            onChange={(e) => onShowOnlyTrackedChange(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Only tracked items
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={showLowStock}
              onChange={(e) => onShowLowStockChange(e.target.checked)}
              className="h-4 w-4 rounded border-[hsl(var(--border))]"
            />
            Low stock
          </label>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[hsl(var(--muted-foreground))]">Threshold</span>
            <input
              type="number"
              value={lowStockThreshold}
              onChange={(e) => onLowStockThresholdChange(Number(e.target.value) || 0)}
              className="h-9 w-24 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}