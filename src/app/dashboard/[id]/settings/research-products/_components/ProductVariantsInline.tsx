"use client";

import { useState } from "react";
import { Pencil, Trash2, ImagePlus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { supabasePublicUrlFromImage } from "@/lib/images";

interface ProductVariantsInlineProps {
  productId: string;
  variants: any[];
  productImages?: any[]; // detail.product_images — full product photo pool to assign from
  productMaterial?: string | null;  // ← NEW: Get from product, not variant
  productMadeIn?: string | null;    // ← NEW: Get from product, not variant
  onChanged: () => void;
}

export default function ProductVariantsInline({
  productId,
  variants,
  productImages = [],
  productMaterial,
  productMadeIn,
  onChanged,
}: ProductVariantsInlineProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [pickerVariantId, setPickerVariantId] = useState<string | null>(null);
  const [busyImageKey, setBusyImageKey] = useState<string | null>(null);

  const assignImage = async (variantId: string, imageId: string, isPrimary = false) => {
    const key = `${variantId}:${imageId}`;
    setBusyImageKey(key);
    try {
      const res = await fetch(
        `/api/research-products/admin/${productId}/variants/${variantId}/images`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_id: imageId, is_primary: isPrimary }),
        }
      );
      if (!res.ok) throw new Error("Failed to assign photo");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to assign photo");
    } finally {
      setBusyImageKey(null);
    }
  };

  const unassignImage = async (variantId: string, imageId: string) => {
    const key = `${variantId}:${imageId}`;
    setBusyImageKey(key);
    try {
      const res = await fetch(
        `/api/research-products/admin/${productId}/variants/${variantId}/images?image_id=${imageId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to remove photo");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove photo");
    } finally {
      setBusyImageKey(null);
    }
  };

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

      const res = await fetch(`/api/research-products/admin/${productId}/variants/${variantId}`, {
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
      const res = await fetch(`/api/research-products/admin/${productId}/variants/${variantId}`, {
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

                    {/* Assigned Photos */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {(v.images ?? []).map((vi: any) => {
                        const img = productImages.find((pi) => pi.id === vi.image_id);
                        const url = img ? supabasePublicUrlFromImage(img) : null;
                        const key = `${v.id}:${vi.image_id}`;
                        return (
                          <div
                            key={vi.image_id}
                            className="relative w-12 h-12 rounded border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-100 dark:bg-gray-800 group"
                            title={img?.alt_text ?? "Variant photo"}
                          >
                            {url ? (
                              <img src={url} alt={img?.alt_text ?? ""} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                                IMG
                              </div>
                            )}
                            {vi.is_primary && (
                              <Star size={10} className="absolute top-0.5 left-0.5 fill-yellow-400 text-yellow-500" />
                            )}
                            <button
                              type="button"
                              onClick={() => unassignImage(v.id, vi.image_id)}
                              disabled={busyImageKey === key}
                              className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove from this variant"
                            >
                              <X size={14} className="text-white" />
                            </button>
                          </div>
                        );
                      })}

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-12 px-2 text-xs gap-1"
                        onClick={() => setPickerVariantId(pickerVariantId === v.id ? null : v.id)}
                      >
                        <ImagePlus size={14} />
                        {pickerVariantId === v.id ? "Close" : "Add photo"}
                      </Button>
                    </div>

                    {/* Photo picker — pulls from the product's uploaded photos */}
                    {pickerVariantId === v.id && (
                      <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50">
                        {productImages.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            No photos uploaded to this product yet — upload some in the Photos tab first.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {productImages.map((img) => {
                              const url = supabasePublicUrlFromImage(img);
                              const assigned = (v.images ?? []).some((vi: any) => vi.image_id === img.id);
                              const key = `${v.id}:${img.id}`;
                              return (
                                <button
                                  type="button"
                                  key={img.id}
                                  disabled={busyImageKey === key}
                                  onClick={() =>
                                    assigned ? unassignImage(v.id, img.id) : assignImage(v.id, img.id)
                                  }
                                  className={`relative w-14 h-14 rounded border-2 overflow-hidden ${
                                    assigned
                                      ? "border-blue-500"
                                      : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                                  }`}
                                  title={assigned ? "Assigned — click to remove" : "Click to assign to this variant"}
                                >
                                  {url ? (
                                    <img src={url} alt={img.alt_text ?? ""} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800">
                                      IMG
                                    </div>
                                  )}
                                  {assigned && (
                                    <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center text-white text-xs font-bold">
                                      ✓
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
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