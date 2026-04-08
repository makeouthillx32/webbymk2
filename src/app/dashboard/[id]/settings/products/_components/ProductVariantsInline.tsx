"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";

interface ProductVariantsInlineProps {
  productId: string;
  variants: any[];
  productMaterial?: string | null;  // ← NEW: Get from product, not variant
  productMadeIn?: string | null;    // ← NEW: Get from product, not variant
  onChanged: () => void;
}

export default function ProductVariantsInline({
  productId,
  variants,
  productMaterial,
  productMadeIn,
  onChanged,
}: ProductVariantsInlineProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const startEdit = (v: any) => {
    setEditingId(v.id);
    setEditForm({
      title: v.title || "",
      sku: v.sku || "",
      price_cents: v.price_cents || "",
      weight_grams: v.weight_grams || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (variantId: string) => {
    try {
      const payload: any = {
        title: editForm.title.trim() || null,
        sku: editForm.sku.trim() || null,
      };

      if (editForm.price_cents) {
        payload.price_cents = Number(editForm.price_cents);
      }
      if (editForm.weight_grams) {
        payload.weight_grams = Number(editForm.weight_grams);
      }

      const res = await fetch(`/api/products/admin/${productId}/variants/${variantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to update variant");

      toast.success("Variant updated");
      setEditingId(null);
      setEditForm({});
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to update variant");
    }
  };

  const deleteVariant = async (variantId: string) => {
    if (!confirm("Delete this variant? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/products/admin/${productId}/variants/${variantId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete variant");

      toast.success("Variant deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete variant");
    }
  };

  if (!variants || variants.length === 0) {
    return <p className="text-sm text-muted-foreground">No variants yet.</p>;
  }

  return (
    <div className="space-y-3">
      {variants.map((v) => {
        const isEditing = editingId === v.id;
        const options = v.options || {};

        // Extract size
        const size = options.size || null;

        // Extract color (handle both single color object and colors array)
        const colorObj = options.color || null;
        const colorsArray = options.colors || [];
        const hasColor = colorObj || colorsArray.length > 0;

        return (
          <div
            key={v.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3"
          >
            {!isEditing ? (
              <>
                {/* View Mode */}
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div>
                      <h4 className="font-semibold text-base">{v.title || "Untitled Variant"}</h4>
                      {v.sku && <p className="text-sm text-gray-600 dark:text-gray-400">SKU: {v.sku}</p>}
                    </div>

                    {/* Variant Options Section */}
                    {(size || hasColor) && (
                      <div className="space-y-2 bg-gray-50 dark:bg-gray-800 rounded p-3">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Variant Options
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {/* Size Badge */}
                          {size && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                              {size}
                            </span>
                          )}

                          {/* Single Color */}
                          {colorObj && (
                            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
                              <span
                                className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500"
                                style={{ backgroundColor: colorObj.hex }}
                              />
                              {colorObj.name}
                            </span>
                          )}

                          {/* Multiple Colors */}
                          {colorsArray.length > 0 && colorsArray.map((c: any, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                            >
                              <span
                                className="w-4 h-4 rounded-full border border-gray-300 dark:border-gray-500"
                                style={{ backgroundColor: c.hex }}
                              />
                              {c.name}
                            </span>
                          ))}

                          {/* Product-Level Material (from product, not variant) */}
                          {productMaterial && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {productMaterial}
                            </span>
                          )}

                          {/* Product-Level Made In (from product, not variant) */}
                          {productMadeIn && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              Made in {productMadeIn}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Price and Weight */}
                    <div className="flex gap-4 text-sm">
                      {v.price_cents != null && (
                        <span className="text-gray-700 dark:text-gray-300">
                          Price: ${(v.price_cents / 100).toFixed(2)}
                        </span>
                      )}
                      {v.weight_grams != null && (
                        <span className="text-gray-700 dark:text-gray-300">
                          Weight: {v.weight_grams}g
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                      <Pencil size={16} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteVariant(v.id)}>
                      <Trash2 size={16} className="text-red-600" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Edit Mode */}
                <div className="space-y-3">
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="Title"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  />
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    placeholder="SKU"
                    value={editForm.sku}
                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                  />
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    placeholder="Price (cents)"
                    value={editForm.price_cents}
                    onChange={(e) => setEditForm({ ...editForm, price_cents: e.target.value })}
                  />
                  <input
                    className="w-full border rounded px-3 py-2 text-sm"
                    type="number"
                    placeholder="Weight (grams)"
                    value={editForm.weight_grams}
                    onChange={(e) => setEditForm({ ...editForm, weight_grams: e.target.value })}
                  />

                  {/* Show read-only variant options */}
                  {(size || hasColor) && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Variant Options (Read-Only)
                      </p>
                      <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                        {size && <span>Size: {size}</span>}
                        {colorObj && <span>Color: {colorObj.name}</span>}
                        {colorsArray.length > 0 && (
                          <span>Colors: {colorsArray.map((c: any) => c.name).join(", ")}</span>
                        )}
                        {productMaterial && <span>Material: {productMaterial}</span>}
                        {productMadeIn && <span>Made In: {productMadeIn}</span>}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(v.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="secondary" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}