// app/dashboard/[id]/settings/products/_components/VariantForm.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import type { CreateVariantInput, UpdateVariantInput } from "@/types/product-variants";

interface VariantFormProps {
  productId: string;
  initialData?: UpdateVariantInput & { id?: string };
  onSubmit: (data: CreateVariantInput | UpdateVariantInput) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

export default function VariantForm({
  productId,
  initialData,
  onSubmit,
  onCancel,
  submitting,
}: VariantFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [sku, setSku] = useState(initialData?.sku ?? "");
  const [price, setPrice] = useState(
    initialData?.price_cents ? (initialData.price_cents / 100).toFixed(2) : ""
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    initialData?.compare_at_price_cents
      ? (initialData.compare_at_price_cents / 100).toFixed(2)
      : ""
  );
  const [weight, setWeight] = useState(
    initialData?.weight_grams?.toString() ?? ""
  );
  const [trackInventory, setTrackInventory] = useState(
    initialData?.track_inventory ?? true
  );
  const [quantity, setQuantity] = useState(
    initialData?.quantity?.toString() ?? "0"
  );
  const [allowBackorder, setAllowBackorder] = useState(
    initialData?.allow_backorder ?? false
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert("Title is required");
      return;
    }

    const data: CreateVariantInput | UpdateVariantInput = {
      title: title.trim(),
      sku: sku.trim() || null,
      price_cents: price ? Math.round(parseFloat(price) * 100) : undefined,
      compare_at_price_cents: compareAtPrice
        ? Math.round(parseFloat(compareAtPrice) * 100)
        : null,
      weight_grams: weight ? parseInt(weight, 10) : null,
      track_inventory: trackInventory,
      quantity: parseInt(quantity, 10) || 0,
      allow_backorder: allowBackorder,
    };

    await onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="variant-title">
            Title <span className="text-red-500">*</span>
          </Label>
          <Input
            id="variant-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Default, Size 7, Red"
            required
          />
        </div>

        {/* SKU */}
        <div className="space-y-2">
          <Label htmlFor="variant-sku">SKU</Label>
          <Input
            id="variant-sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g., DES-BOOT-001"
          />
        </div>

        {/* Price */}
        <div className="space-y-2">
          <Label htmlFor="variant-price">Price ($)</Label>
          <Input
            id="variant-price"
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="89.99"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Leave empty to use product price
          </p>
        </div>

        {/* Compare-at Price */}
        <div className="space-y-2">
          <Label htmlFor="variant-compare-price">Compare-at Price ($)</Label>
          <Input
            id="variant-compare-price"
            type="number"
            step="0.01"
            min="0"
            value={compareAtPrice}
            onChange={(e) => setCompareAtPrice(e.target.value)}
            placeholder="129.99"
          />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Original price for sale display
          </p>
        </div>

        {/* Weight */}
        <div className="space-y-2">
          <Label htmlFor="variant-weight">Weight (grams)</Label>
          <Input
            id="variant-weight"
            type="number"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="1200"
          />
        </div>

        {/* Stock Quantity */}
        <div className="space-y-2">
          <Label htmlFor="variant-quantity">Stock Quantity</Label>
          <Input
            id="variant-quantity"
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={!trackInventory}
          />
        </div>
      </div>

      {/* Inventory Settings */}
      <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
        <h5 className="text-sm font-medium text-[hsl(var(--foreground))]">
          Inventory Settings
        </h5>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="track-inventory"
            checked={trackInventory}
            onChange={(e) => setTrackInventory(e.target.checked)}
            className="rounded border-[hsl(var(--input))]"
          />
          <Label htmlFor="track-inventory" className="font-normal cursor-pointer">
            Track inventory for this variant
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="allow-backorder"
            checked={allowBackorder}
            onChange={(e) => setAllowBackorder(e.target.checked)}
            className="rounded border-[hsl(var(--input))]"
            disabled={!trackInventory}
          />
          <Label 
            htmlFor="allow-backorder" 
            className={`font-normal ${!trackInventory ? 'opacity-50' : 'cursor-pointer'}`}
          >
            Allow backorders when out of stock
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>{initialData?.id ? "Update" : "Create"} Variant</>
          )}
        </Button>
      </div>
    </form>
  );
}
