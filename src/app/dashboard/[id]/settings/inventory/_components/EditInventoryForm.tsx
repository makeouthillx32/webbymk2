// app/settings/inventory/_components/EditInventoryForm.tsx
"use client";

import { useEffect, useState } from "react";
import { InventoryModal } from "./InventoryModal";
import type { InventoryRow } from "./InventoryTable";

type Props = {
  open: boolean;
  row: InventoryRow | null;
  onClose: () => void;
  onSave: (data: {
    inventory_id: string;
    quantity: number;
    track_inventory: boolean;
    allow_backorder: boolean;
  }) => Promise<void> | void;
};

export function EditInventoryForm({ open, row, onClose, onSave }: Props) {
  const [qty, setQty] = useState(0);
  const [track, setTrack] = useState(true);
  const [backorder, setBackorder] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) return;
    setQty(Number(row.quantity ?? 0));
    setTrack(!!row.track_inventory);
    setBackorder(!!row.allow_backorder);
  }, [row]);

  if (!open || !row) return null;

  const submit = async () => {
    try {
      setSaving(true);
      await onSave({
        inventory_id: row.inventory_id,
        quantity: Math.max(0, Number(qty) || 0),
        track_inventory: track,
        allow_backorder: backorder,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventoryModal
      open={open}
      title="Edit inventory"
      description={`${row.product_title ?? "Product"}${row.variant_title ? ` • ${row.variant_title}` : ""}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3">
          <p className="text-xs text-[hsl(var(--muted-foreground))]">SKU</p>
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{row.sku ?? "—"}</p>
        </div>

        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            checked={track}
            onChange={(e) => setTrack(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Track inventory
        </label>

        <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))]">
          <input
            type="checkbox"
            checked={backorder}
            onChange={(e) => setBackorder(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))]"
          />
          Allow backorder (can sell when quantity is 0)
        </label>

        <div>
          <label className="text-sm font-medium text-[hsl(var(--foreground))]">
            Quantity on hand
          </label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
            disabled={!track}
            className="mt-1 h-10 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm disabled:opacity-60"
          />
          {!track ? (
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Quantity is ignored when “Track inventory” is off (infinite stock).
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[var(--radius)] border border-[hsl(var(--border))] px-4 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={submit}
            className="h-9 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </InventoryModal>
  );
}