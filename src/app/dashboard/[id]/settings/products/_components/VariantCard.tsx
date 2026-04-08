// app/dashboard/[id]/settings/products/_components/VariantCard.tsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Edit2, 
  Trash2, 
  Package, 
  DollarSign, 
  Hash,
  Weight,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Palette,
  Ruler,
  Box,
  MapPin,
} from "lucide-react";
import { toast } from "react-hot-toast";
import type { ProductVariant, UpdateVariantInput } from "@/types/product-variants";
import VariantForm from "./VariantForm";

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 300) } };
  }
}

function centsToMoney(cents: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

interface VariantCardProps {
  variant: ProductVariant;
  productId: string;
  onDelete: () => void;
  onUpdate: () => void;
}

export default function VariantCard({
  variant,
  productId,
  onDelete,
  onUpdate,
}: VariantCardProps) {
  const [editing, setEditing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleUpdate = async (data: UpdateVariantInput) => {
    setUpdating(true);
    try {
      const res = await fetch(
        `/api/products/admin/${productId}/variants/${variant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message ?? "Failed to update variant");
      }

      toast.success("Variant updated");
      setEditing(false);
      onUpdate();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to update variant");
    } finally {
      setUpdating(false);
    }
  };

  const stockStatus = variant.inventory?.track_inventory
    ? variant.inventory.quantity > 0
      ? "In Stock"
      : variant.inventory.allow_backorder
      ? "Backorder"
      : "Out of Stock"
    : "Not Tracked";

  const stockColor =
    stockStatus === "In Stock"
      ? "bg-green-500/10 text-green-700 border-green-500/20"
      : stockStatus === "Backorder"
      ? "bg-yellow-500/10 text-yellow-700 border-yellow-500/20"
      : stockStatus === "Out of Stock"
      ? "bg-red-500/10 text-red-700 border-red-500/20"
      : "bg-gray-500/10 text-gray-700 border-gray-500/20";

  if (editing) {
    return (
      <div className="border border-[hsl(var(--border))] rounded-lg p-4 bg-[hsl(var(--card))]">
        <h4 className="text-sm font-medium mb-3 text-[hsl(var(--foreground))]">
          Edit Variant: {variant.title}
        </h4>
        <VariantForm
          productId={productId}
          initialData={{
            id: variant.id,
            title: variant.title,
            sku: variant.sku,
            price_cents: variant.price_cents,
            compare_at_price_cents: variant.compare_at_price_cents,
            weight_grams: variant.weight_grams,
            track_inventory: variant.track_inventory,
            quantity: variant.inventory?.quantity ?? 0,
            allow_backorder: variant.allow_backorder,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          submitting={updating}
        />
      </div>
    );
  }

  return (
    <div className="border border-[hsl(var(--border))] rounded-lg overflow-hidden bg-[hsl(var(--card))]">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h4 className="text-base font-semibold text-[hsl(var(--foreground))] truncate">
                {variant.title}
              </h4>
              {!variant.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
            </div>

            {/* Quick Stats Row 1: Basic Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-2">
              {variant.sku && (
                <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                  <Hash size={14} />
                  <span className="truncate">{variant.sku}</span>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                <DollarSign size={14} />
                <span>{centsToMoney(variant.price_cents, variant.currency)}</span>
              </div>

              {variant.weight_grams && (
                <div className="flex items-center gap-1.5 text-[hsl(var(--muted-foreground))]">
                  <Weight size={14} />
                  <span>{variant.weight_grams}g</span>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <Package size={14} className={stockColor.includes("green") ? "text-green-600" : stockColor.includes("red") ? "text-red-600" : "text-gray-500"} />
                <Badge variant="outline" className={`text-xs ${stockColor}`}>
                  {variant.inventory?.track_inventory
                    ? `${variant.inventory.quantity} units`
                    : stockStatus}
                </Badge>
              </div>
            </div>

            {/* Quick Stats Row 2: Options Preview */}
            {variant.options && Object.keys(variant.options).length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {variant.options.size && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                    <Ruler size={12} />
                    <span>{variant.options.size}</span>
                  </div>
                )}
                
                {variant.options.color && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                    <Palette size={12} />
                    <span>
                      {typeof variant.options.color === 'string' 
                        ? variant.options.color 
                        : variant.options.color.name}
                    </span>
                    {typeof variant.options.color === 'object' && variant.options.color.hex && (
                      <div
                        className="w-3 h-3 rounded-full border border-[hsl(var(--border))]"
                        style={{ backgroundColor: variant.options.color.hex }}
                      />
                    )}
                  </div>
                )}

                {variant.options.material && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                    <Box size={12} />
                    <span>{variant.options.material}</span>
                  </div>
                )}

                {variant.options.made_in && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                    <MapPin size={12} />
                    <span>{variant.options.made_in}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              title="Edit variant"
            >
              <Edit2 size={16} />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              title="Delete variant"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 size={16} />
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-[hsl(var(--border))] p-4 bg-[hsl(var(--muted)/0.3)] space-y-4">
          {/* Variant Options - DETAILED VIEW */}
          {variant.options && Object.keys(variant.options).length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">
                Variant Options
              </h5>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {/* Size */}
                {variant.options.size && (
                  <div className="flex items-start gap-2">
                    <Ruler size={16} className="text-[hsl(var(--muted-foreground))] mt-0.5" />
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))] text-xs">Size</div>
                      <div className="font-medium">{variant.options.size}</div>
                    </div>
                  </div>
                )}

                {/* Color */}
                {variant.options.color && (
                  <div className="flex items-start gap-2">
                    <Palette size={16} className="text-[hsl(var(--muted-foreground))] mt-0.5" />
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))] text-xs">Color</div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {typeof variant.options.color === 'string' 
                            ? variant.options.color 
                            : variant.options.color.name}
                        </span>
                        {typeof variant.options.color === 'object' && variant.options.color.hex && (
                          <div className="flex items-center gap-1">
                            <div
                              className="w-5 h-5 rounded border-2 border-[hsl(var(--border))] shadow-sm"
                              style={{ backgroundColor: variant.options.color.hex }}
                              title={variant.options.color.hex}
                            />
                            <span className="text-xs text-[hsl(var(--muted-foreground))] font-mono">
                              {variant.options.color.hex}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Material */}
                {variant.options.material && (
                  <div className="flex items-start gap-2">
                    <Box size={16} className="text-[hsl(var(--muted-foreground))] mt-0.5" />
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))] text-xs">Material</div>
                      <div className="font-medium">{variant.options.material}</div>
                    </div>
                  </div>
                )}

                {/* Made In */}
                {variant.options.made_in && (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-[hsl(var(--muted-foreground))] mt-0.5" />
                    <div>
                      <div className="text-[hsl(var(--muted-foreground))] text-xs">Made In</div>
                      <div className="font-medium">{variant.options.made_in}</div>
                    </div>
                  </div>
                )}

                {/* Custom Options */}
                {Object.entries(variant.options)
                  .filter(([key]) => !['size', 'color', 'material', 'made_in', 'colors'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2">
                      <Hash size={16} className="text-[hsl(var(--muted-foreground))] mt-0.5" />
                      <div>
                        <div className="text-[hsl(var(--muted-foreground))] text-xs capitalize">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Pricing Details */}
          {variant.compare_at_price_cents && (
            <div>
              <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">
                Pricing
              </h5>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">Price:</span>
                  <span className="ml-2 font-medium">
                    {centsToMoney(variant.price_cents, variant.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">Compare-at:</span>
                  <span className="ml-2 font-medium line-through">
                    {centsToMoney(variant.compare_at_price_cents, variant.currency)}
                  </span>
                </div>
              </div>
              <div className="mt-1">
                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
                  {Math.round(
                    ((variant.compare_at_price_cents - variant.price_cents) /
                      variant.compare_at_price_cents) *
                      100
                  )}
                  % OFF
                </Badge>
              </div>
            </div>
          )}

          {/* Inventory Details */}
          {variant.inventory?.track_inventory && (
            <div>
              <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">
                Inventory
              </h5>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">Quantity:</span>
                  <span className="ml-2 font-medium">{variant.inventory.quantity}</span>
                </div>
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">Backorder:</span>
                  <span className="ml-2">
                    {variant.inventory.allow_backorder ? "Allowed" : "Not Allowed"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Assigned Images */}
          {variant.images && variant.images.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2 flex items-center gap-1">
                <ImageIcon size={14} />
                Assigned Images ({variant.images.length})
              </h5>
              <div className="flex gap-2 flex-wrap">
                {variant.images.map((img) => (
                  <div
                    key={img.image_id}
                    className="w-16 h-16 rounded border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--muted))]"
                    title={img.alt_text ?? "Variant image"}
                  >
                    {/* TODO: Replace with actual image display using storagePathToUrl */}
                    <div className="w-full h-full flex items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">
                      IMG
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-[hsl(var(--muted-foreground))] pt-2 border-t border-[hsl(var(--border))]">
            <div>Created: {new Date(variant.created_at).toLocaleString()}</div>
            <div>Updated: {new Date(variant.updated_at).toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}