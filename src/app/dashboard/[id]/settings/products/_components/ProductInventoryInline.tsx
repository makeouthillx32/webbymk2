// app/dashboard/[id]/settings/products/_components/ProductInventoryInline.tsx
"use client";

import { useState } from "react";
import { Package2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "react-hot-toast";

interface Variant {
  id: string;
  title: string;
  sku: string | null;
  inventory_qty?: number;
  track_inventory?: boolean;
}

interface ProductInventoryInlineProps {
  variants: Variant[];
  onChanged: () => void;
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function ProductInventoryInline({
  variants,
  onChanged,
}: ProductInventoryInlineProps) {
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [deltaQty, setDeltaQty] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdjust = async (variantId: string) => {
    if (!deltaQty.trim()) return toast.error("Enter quantity");

    const delta = parseInt(deltaQty, 10);
    if (isNaN(delta) || delta === 0) {
      return toast.error("Enter a valid non-zero number");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: variantId,
          delta_qty: delta,
          reason: delta > 0 ? "restock" : "adjustment",
          note: note.trim() || null,
        }),
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed");

      toast.success("Inventory adjusted");
      setAdjustingId(null);
      setDeltaQty("");
      setNote("");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to adjust inventory");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Package2 size={16} />
          Inventory ({variants.length} variant{variants.length === 1 ? "" : "s"})
        </h3>
        <a
          href="/admin/settings/inventory"
          className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline"
        >
          Full Inventory Manager →
        </a>
      </div>

      <div className="space-y-2">
        {variants.map((v) => {
          const isAdjusting = adjustingId === v.id;
          const qty = v.inventory_qty ?? 0;

          return (
            <div
              key={v.id}
              className="border border-[hsl(var(--border))] rounded-lg p-3"
            >
              {isAdjusting ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{v.title}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    Current: {qty} units
                  </div>
                  <Input
                    type="number"
                    placeholder="Change (+10 or -5)"
                    value={deltaQty}
                    onChange={(e) => setDeltaQty(e.target.value)}
                  />
                  <Input
                    placeholder="Note (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAdjust(v.id)}
                      disabled={saving}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setAdjustingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{v.title}</div>
                    {v.sku && (
                      <div className="text-sm text-[hsl(var(--muted-foreground))]">
                        SKU: {v.sku}
                      </div>
                    )}
                    <div className="text-sm">
                      Stock: <span className="font-medium">{qty} units</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAdjustingId(v.id);
                      setDeltaQty("");
                      setNote("");
                    }}
                  >
                    Adjust
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {variants.length === 0 && (
        <div className="text-center py-8 text-sm text-[hsl(var(--muted-foreground))]">
          No variants to track inventory
        </div>
      )}
    </div>
  );
}
