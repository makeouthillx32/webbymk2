// app/dashboard/[id]/settings/products/_components/ProductDefaultVariantSection.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProductDefaultVariantSectionProps {
  sku: string; // This now acts as the Base SKU
  onSkuChange: (value: string) => void;
  weightGrams: string;
  onWeightGramsChange: (value: string) => void;
  priceOverride: string;
  onPriceOverrideChange: (value: string) => void;
}

export default function ProductDefaultVariantSection({
  sku,
  onSkuChange,
  weightGrams,
  onWeightGramsChange,
  priceOverride,
  onPriceOverrideChange,
}: ProductDefaultVariantSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-[hsl(var(--border))]">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[hsl(var(--accent))] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Package size={16} />
          <span className="text-sm font-semibold">Base Product Data</span>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          Base SKU, weight, pricing
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Base SKU</label>
            <Input
              value={sku}
              onChange={(e) => onSkuChange(e.target.value)}
              placeholder="e.g., LC25-42552-P1720"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              The root SKU used to generate variant SKUs (e.g., Base-S, Base-M)
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Default Weight (grams)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={weightGrams}
              onChange={(e) => onWeightGramsChange(e.target.value)}
              placeholder="e.g., 1200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Base Price (USD)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={priceOverride}
              onChange={(e) => onPriceOverrideChange(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
      )}
    </div>
  );
}