// app/dashboard/[id]/settings/products/_components/CreateProductModal.tsx
"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-hot-toast";
import { createBrowserClient } from "@/utils/supabase/client";

import ProductDefaultVariantSection from "./ProductDefaultVariantSection";
import ProductCategoriesSection from "./ProductCategoriesSection";
import ProductCollectionsSection from "./ProductCollectionsSection";
import ProductInitialStockSection from "./ProductInitialStockSection";

// Image helpers
const PRODUCT_IMAGE_BUCKET = process.env.NEXT_PUBLIC_PRODUCT_IMAGE_BUCKET || "product-media";

function buildObjectPath(productId: string, index: number, ext: string) {
  return `products/${productId}/${index}.${ext}`;
}

function safeExtFromFile(file: File) {
  const name = file.name || "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "jpg";
}

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 300) } };
  }
}

interface CreateProductModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export default function CreateProductModal({
  open,
  onOpenChange,
  onCreated,
}: CreateProductModalProps) {
  // Core product fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  // Images (existing)
  const [files, setFiles] = useState<File[]>([]);
  const [alt, setAlt] = useState("");

  // NEW: Default variant fields
  const [variantSku, setVariantSku] = useState("");
  const [variantWeight, setVariantWeight] = useState("");
  const [variantPriceOverride, setVariantPriceOverride] = useState("");

  // NEW: Categories & Collections
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);

  // NEW: Initial stock
  const [initialStock, setInitialStock] = useState("");

  const [creating, setCreating] = useState(false);

  const autoSlug = () => {
    const s = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(s);
  };

  const reset = () => {
    setTitle("");
    setSlug("");
    setPrice("");
    setDescription("");
    setFiles([]);
    setAlt("");
    setVariantSku("");
    setVariantWeight("");
    setVariantPriceOverride("");
    setCategoryIds([]);
    setCollectionIds([]);
    setInitialStock("");
  };

  const create = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!slug.trim()) return toast.error("Slug is required");
    if (!price.trim()) return toast.error("Price is required");

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return toast.error("Price must be a valid number >= 0");
    }
    const cents = Math.round(priceNum * 100);

    setCreating(true);

    try {
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 1: Create product
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim() ? description.trim() : null,
          price_cents: cents,
          status: "draft",
        }),
      });

      const json = await safeReadJson(res);
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Failed to create product");

      const productId = json.data?.id as string;
      if (!productId) throw new Error("Create succeeded but no product id returned");

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 2: Create default variant (if SKU or weight provided)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      let variantId: string | null = null;

      const hasVariantData = variantSku.trim() || variantWeight.trim() || variantPriceOverride.trim();

      if (hasVariantData) {
        const variantData: any = {
          title: "Default",
          sku: variantSku.trim() || null,
        };

        // Weight
        if (variantWeight.trim()) {
          const weightNum = parseInt(variantWeight, 10);
          if (!isNaN(weightNum) && weightNum >= 0) {
            variantData.weight_grams = weightNum;
          }
        }

        // Price override
        if (variantPriceOverride.trim()) {
          const overrideNum = parseFloat(variantPriceOverride);
          if (!isNaN(overrideNum) && overrideNum >= 0) {
            variantData.price_cents = Math.round(overrideNum * 100);
          }
        }

        const vRes = await fetch(`/api/products/admin/${productId}/variants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(variantData),
        });

        const vJson = await safeReadJson(vRes);
        if (!vRes.ok || !vJson?.ok) {
          throw new Error(vJson?.error?.message ?? "Failed to create default variant");
        }

        variantId = vJson.data?.variant?.id || null;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 3: Seed initial inventory (if variant created + stock provided)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (variantId && initialStock.trim()) {
        const stockNum = parseInt(initialStock, 10);
        if (!isNaN(stockNum) && stockNum > 0) {
          const invRes = await fetch("/api/inventory/movements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              variant_id: variantId,
              delta_qty: stockNum,
              reason: "initial",
              note: "Initial stock from product creation",
            }),
          });

          const invJson = await safeReadJson(invRes);
          if (!invRes.ok || !invJson?.ok) {
            console.warn("Failed to create initial stock:", invJson?.error?.message);
            // Don't throw - product is created, just log warning
          }
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 4: Assign categories (parallel)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (categoryIds.length > 0) {
        await Promise.allSettled(
          categoryIds.map((catId) =>
            fetch(`/api/products/admin/${productId}/categories`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ category_id: catId }),
            })
          )
        );
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 5: Assign collections (parallel)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (collectionIds.length > 0) {
        await Promise.allSettled(
          collectionIds.map((colId) =>
            fetch(`/api/products/admin/${productId}/collections`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ collection_id: colId }),
            })
          )
        );
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // STEP 6: Upload images (existing logic)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (files.length) {
        const supabase = createBrowserClient();

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const ext = safeExtFromFile(file);
          const object_path = buildObjectPath(productId, i + 1, ext);

          const up = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(object_path, file, {
            upsert: false,
            cacheControl: "3600",
            contentType: file.type || "application/octet-stream",
          });

          if (up.error) throw new Error(up.error.message);

          const r2 = await fetch(`/api/products/admin/${productId}/images`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bucket_name: PRODUCT_IMAGE_BUCKET,
              object_path,
              alt_text: alt.trim() ? alt.trim() : null,
              position: i,
            }),
          });

          const j2 = await safeReadJson(r2);
          if (!r2.ok || !j2?.ok) {
            throw new Error(j2?.error?.message ?? `Failed to create image row (${r2.status})`);
          }
        }
      }

      // Success!
      const successMessage = [
        "Product created",
        hasVariantData && "with default variant",
        initialStock.trim() && variantId && "and initial stock",
        files.length && `+ ${files.length} image${files.length === 1 ? "" : "s"}`,
      ]
        .filter(Boolean)
        .join(" ");

      toast.success(successMessage);
      onOpenChange(false);
      onCreated();
      reset();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Product</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ━━━ Core Fields ━━━ */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Slug</label>
            <div className="flex gap-2">
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
              <Button type="button" variant="secondary" onClick={autoSlug}>
                Auto
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Price (USD)</label>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* ━━━ Images (existing) ━━━ */}
          <div className="rounded-xl border border-[hsl(var(--border))] p-3">
            <div className="text-sm font-semibold">Images (optional)</div>
            <div className="mt-2 space-y-2">
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              />
              <Input
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="Alt text applied to uploaded images (optional)"
              />
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Saved as: <code>products/&lt;productId&gt;/1.ext</code>, <code>2.ext</code>...
              </div>
            </div>
          </div>

          {/* ━━━ NEW: Default Variant ━━━ */}
          <ProductDefaultVariantSection
            sku={variantSku}
            onSkuChange={setVariantSku}
            weightGrams={variantWeight}
            onWeightGramsChange={setVariantWeight}
            priceOverride={variantPriceOverride}
            onPriceOverrideChange={setVariantPriceOverride}
          />

          {/* ━━━ NEW: Initial Stock ━━━ */}
          <ProductInitialStockSection
            quantity={initialStock}
            onQuantityChange={setInitialStock}
          />

          {/* ━━━ NEW: Categories ━━━ */}
          <ProductCategoriesSection
            selectedIds={categoryIds}
            onSelectedIdsChange={setCategoryIds}
          />

          {/* ━━━ NEW: Collections ━━━ */}
          <ProductCollectionsSection
            selectedIds={collectionIds}
            onSelectedIdsChange={setCollectionIds}
          />

          {/* ━━━ Actions ━━━ */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={create} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
