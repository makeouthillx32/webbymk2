// app/dashboard/[id]/settings/products/_components/ProductInitialStockSection.tsx
"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Package2 } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProductInitialStockSectionProps {
  quantity: string;
  onQuantityChange: (value: string) => void;
}

export default function ProductInitialStockSection({
  quantity,
  onQuantityChange,
}: ProductInitialStockSectionProps) {
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
          <Package2 size={16} />
          <span className="text-sm font-semibold">Initial Stock (Optional)</span>
        </div>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">
          Seed inventory
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">Starting Quantity</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => onQuantityChange(e.target.value)}
              placeholder="e.g., 50"
            />
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Initial units in stock. Can be adjusted later in Inventory Manager.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
