// app/dashboard/[id]/settings/products/_components/ProductsTable.tsx
"use client";

import React, { useState } from "react";
import { Trash2, Loader2, Settings2, Image as ImageIcon, Tag as TagIcon, Star, CheckCircle2, Archive, FileEdit, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPrimaryImageUrl } from "@/lib/images";

export type ProductImageRow = {
  id?: string;
  bucket_name: string | null;
  object_path: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
  position?: number | null;
  is_primary?: boolean | null;
  is_public?: boolean | null;
  created_at?: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  slug: string;
};

export type ProductRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  dosage_label?: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  badge: string | null;
  is_featured: boolean;
  status?: string;
  created_at: string;
  product_images?: ProductImageRow[];
  categories?: ProductCategory[];
};

interface ProductsTableProps {
  products: ProductRow[];
  allProductsCount?: number;
  isRefreshing?: boolean;
  onManage: (product: ProductRow) => void;
  onArchive: (product: ProductRow) => void;
  onStatusChange?: (product: ProductRow, newStatus: string) => Promise<void>;
  onToggleFeatured?: (product: ProductRow, newFeatured: boolean) => Promise<void>;
}

function centsToMoney(cents: number, currency: string = "USD") {
  const amt = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `$${amt.toFixed(2)}`;
  }
}

export default function ProductsTable({
  products,
  allProductsCount,
  isRefreshing = false,
  onManage,
  onArchive,
  onStatusChange,
  onToggleFeatured,
}: ProductsTableProps) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (!products || products.length === 0) {
    return (
      <p className="py-8 text-center text-[hsl(var(--muted-foreground))]">No products found.</p>
    );
  }

  const handleStatusSelect = async (p: ProductRow, newStatus: string) => {
    if (p.status === newStatus || !onStatusChange) return;
    setUpdatingId(p.id);
    try {
      await onStatusChange(p, newStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleFeaturedToggle = async (p: ProductRow) => {
    if (!onToggleFeatured) return;
    setUpdatingId(p.id);
    try {
      await onToggleFeatured(p, !p.is_featured);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-[var(--radius)] overflow-hidden shadow-[var(--shadow-sm)]">
      {/* ── Table Header ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 p-4 bg-[hsl(var(--muted))] font-medium text-[hsl(var(--muted-foreground))] text-xs uppercase tracking-wider items-center">
        <div className="col-span-6 md:col-span-3">Product</div>
        <div className="hidden md:block md:col-span-2">Status</div>
        <div className="hidden md:block md:col-span-2">Categories</div>
        <div className="col-span-3 md:col-span-2">Price</div>
        <div className="hidden md:block md:col-span-1 text-center">Featured</div>
        <div className="col-span-3 md:col-span-2 text-right">Actions</div>
      </div>

      {/* ── Table Rows ──────────────────────────────────────────────────── */}
      <div className="divide-y divide-[hsl(var(--border))]">
        {products.map((p) => {
          const imgCount = p.product_images?.length ?? 0;
          const categories = p.categories ?? [];
          const isBusy = updatingId === p.id;

          const thumbUrl = getPrimaryImageUrl(p.product_images ?? []) ?? null;

          const thumbAlt = p.title || "Product image";
          const currentStatus = (p.status ?? "draft").toLowerCase();

          return (
            <div
              key={p.id}
              className="product-item grid grid-cols-12 gap-y-2 p-4 hover:bg-[hsl(var(--accent))] transition-colors items-center"
            >
              {/* Product Info */}
              <div className="col-span-12 md:col-span-3 min-w-0">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-10 w-10 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-hidden flex items-center justify-center shrink-0">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={thumbAlt} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon size={16} className="text-[hsl(var(--muted-foreground))]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-[hsl(var(--foreground))] truncate">
                        {p.title}
                      </span>
                    </div>

                    <div className="text-xs text-[hsl(var(--muted-foreground))] truncate flex items-center gap-1.5">
                      <span className="truncate">{p.slug}</span>
                      {p.dosage_label ? (
                        <span className="shrink-0 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                          {p.dosage_label}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactive Status Column */}
              <div className="hidden md:flex md:col-span-2 items-center gap-1.5">
                <select
                  value={currentStatus}
                  disabled={isBusy}
                  onChange={(e) => handleStatusSelect(p, e.target.value)}
                  className={`text-xs font-bold px-2.5 py-1 rounded-full border cursor-pointer outline-none transition-all ${
                    currentStatus === "active"
                      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400"
                      : currentStatus === "archived"
                      ? "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400"
                      : "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400"
                  }`}
                >
                  <option value="active">● Active</option>
                  <option value="draft">● Draft</option>
                  <option value="archived">● Archived</option>
                </select>
              </div>

              {/* Categories Column */}
              <div className="hidden md:flex md:col-span-2 items-center flex-wrap gap-1">
                {categories.length > 0 ? (
                  categories.map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]"
                    >
                      {c.name}
                    </span>
                  ))
                ) : (
                  <button
                    onClick={() => onManage(p)}
                    className="inline-flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] border border-dashed border-[hsl(var(--border))] px-2 py-0.5 rounded-md"
                  >
                    <Plus size={12} /> Assign Category
                  </button>
                )}
              </div>

              {/* Price Column */}
              <div className="col-span-6 md:col-span-2 flex items-center">
                <span className="text-sm font-semibold text-[hsl(var(--foreground))]">
                  {centsToMoney(p.price_cents, p.currency)}
                </span>
              </div>

              {/* Featured Toggle Column (Replacing Badge) */}
              <div className="hidden md:flex md:col-span-1 items-center justify-center">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleFeaturedToggle(p)}
                  title={p.is_featured ? "Featured Product (Click to unfeature)" : "Normal Product (Click to feature)"}
                  className={`p-1.5 rounded-lg border transition-all ${
                    p.is_featured
                      ? "bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25"
                      : "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-amber-500 hover:border-amber-500/40"
                  }`}
                >
                  <Star size={18} className={p.is_featured ? "fill-amber-500" : ""} />
                </button>
              </div>

              {/* Actions Column */}
              <div className="col-span-6 md:col-span-2 flex items-center justify-end">
                <div className="flex flex-col sm:flex-row gap-2 items-end sm:items-center">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onManage(p)}
                    className="w-[100px] sm:w-auto"
                  >
                    <Settings2 size={15} className="mr-1.5" />
                    Manage
                  </Button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onArchive(p)}
                    className="w-[100px] sm:w-auto"
                  >
                    <Trash2 size={15} className="mr-1.5" />
                    Archive
                  </Button>
                </div>
              </div>

              {/* Extra Details Sub-Bar */}
              <div className="hidden md:flex md:col-span-12 items-center justify-between pt-2 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))/0.4]">
                <span>Created: {new Date(p.created_at).toLocaleString()}</span>
                <span className="inline-flex items-center gap-1">
                  <ImageIcon size={13} /> {imgCount} image{imgCount === 1 ? "" : "s"}
                  <span className="mx-2">•</span>
                  <TagIcon size={13} /> Manage categories & lab reports via Manage
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table Footer */}
      <div className="p-4 text-sm text-[hsl(var(--muted-foreground))] flex items-center justify-between">
        <span>
          Showing {products.length}
          {typeof allProductsCount === "number" ? ` of ${allProductsCount}` : ""} products
        </span>

        {isRefreshing ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Refreshing…
          </span>
        ) : null}
      </div>
    </div>
  );
}
