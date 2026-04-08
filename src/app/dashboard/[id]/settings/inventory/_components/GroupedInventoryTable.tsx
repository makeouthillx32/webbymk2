"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Package2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProductGroup, InventoryRow } from "../page";

interface Props {
  groups: ProductGroup[];
  lowStockThreshold: number;
  onEdit: (row: InventoryRow) => void;
  expandAll?: boolean;
}

function stockBadge(qty: number, tracked: boolean, threshold: number) {
  if (!tracked) return null;
  if (qty === 0)
    return (
      <Badge variant="destructive" className="text-xs px-1.5 py-0">
        Out
      </Badge>
    );
  if (qty <= threshold)
    return (
      <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
        Low
      </Badge>
    );
  return null;
}

function ProductGroupRow({
  group,
  lowStockThreshold,
  onEdit,
  defaultOpen,
}: {
  group: ProductGroup;
  lowStockThreshold: number;
  onEdit: (row: InventoryRow) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  // Re-sync when search forces expand
  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  const variantCount = group.variants.length;
  const totalQty = group.variants
    .filter((v) => v.track_inventory)
    .reduce((acc, v) => acc + (v.quantity ?? 0), 0);
  const hasLow = group.variants.some(
    (v) => v.track_inventory && (v.quantity ?? 0) <= lowStockThreshold && (v.quantity ?? 0) > 0
  );
  const hasOut = group.variants.some(
    (v) => v.track_inventory && (v.quantity ?? 0) === 0
  );
  const allUntracked = group.variants.every((v) => !v.track_inventory);

  return (
    <div className="border rounded-lg overflow-hidden mb-2">
      {/* Product header row — clickable */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-muted-foreground flex-shrink-0">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        <Package2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />

        <span className="font-semibold text-sm flex-1 truncate">
          {group.product_title}
        </span>

        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasOut && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              Out of stock
            </Badge>
          )}
          {!hasOut && hasLow && (
            <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500 text-white">
              Low stock
            </Badge>
          )}
          {allUntracked && (
            <span className="text-xs text-muted-foreground">Untracked</span>
          )}
          {!allUntracked && !hasOut && !hasLow && (
            <span className="text-xs text-muted-foreground">
              {totalQty} in stock
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {variantCount} variant{variantCount !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {/* Variant rows */}
      {open && (
        <div className="divide-y">
          {group.variants.map((row) => (
            <VariantRow
              key={row.inventory_id}
              row={row}
              lowStockThreshold={lowStockThreshold}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantRow({
  row,
  lowStockThreshold,
  onEdit,
}: {
  row: InventoryRow;
  lowStockThreshold: number;
  onEdit: (row: InventoryRow) => void;
}) {
  const qty = row.quantity ?? 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 pl-10 bg-background hover:bg-muted/20 transition-colors text-sm">
      {/* Variant name + SKU */}
      <div className="flex-1 min-w-0">
        <span className="font-medium truncate">{row.variant_title ?? "Default"}</span>
        {row.sku && (
          <span className="ml-2 text-xs text-muted-foreground font-mono">{row.sku}</span>
        )}
      </div>

      {/* Stock status badge */}
      <div className="w-20 flex justify-center">
        {stockBadge(qty, row.track_inventory, lowStockThreshold)}
      </div>

      {/* Quantity */}
      <div className="w-20 text-center tabular-nums">
        {row.track_inventory ? (
          <span
            className={
              qty === 0
                ? "text-destructive font-semibold"
                : qty <= lowStockThreshold
                ? "text-amber-600 font-semibold"
                : "text-foreground"
            }
          >
            {qty}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </div>

      {/* Track */}
      <div className="w-16 flex justify-center">
        {row.track_inventory ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Backorder */}
      <div className="w-20 flex justify-center">
        {row.allow_backorder ? (
          <CheckCircle2 className="h-4 w-4 text-blue-500" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Edit */}
      <div className="w-10 flex justify-end">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(row)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function GroupedInventoryTable({
  groups,
  lowStockThreshold,
  onEdit,
  expandAll = false,
}: Props) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Package2 className="h-8 w-8 opacity-40" />
        <p className="text-sm">No inventory rows match your filters.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Column header */}
      <div className="flex items-center gap-3 px-4 py-2 pl-10 text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        <div className="flex-1">Variant / SKU</div>
        <div className="w-20 text-center">Status</div>
        <div className="w-20 text-center">Qty</div>
        <div className="w-16 text-center">Tracked</div>
        <div className="w-20 text-center">Backorder</div>
        <div className="w-10" />
      </div>

      {groups.map((group) => (
        <ProductGroupRow
          key={group.product_id}
          group={group}
          lowStockThreshold={lowStockThreshold}
          onEdit={onEdit}
          defaultOpen={expandAll || group.variants.length === 1}
        />
      ))}
    </div>
  );
}