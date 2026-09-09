// app/dashboard/[id]/settings/products/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, ChevronDown, ChevronUp, FlaskConical } from "lucide-react";
import { ShowcaseSection } from "@/components/Layouts/dashboard/sidebar/showcase-section";
import { toast } from "react-hot-toast";

import LoadingState from "./_components/LoadingState";
import ErrorAlert from "./_components/ErrorAlert";
import ProductsSearchBar from "./_components/ProductsSearchBar";
import ProductActionBar from "./_components/ProductActionBar";
import ProductsTable, { ProductRow } from "./_components/ProductsTable";
import ProductsCardGrid from "./_components/ProductsCardGrid";
import type { TabType } from "./_components/types";

import CreateProductModal from "./_components/CreateProductModal";
import ProductModal from "./_components/ProductModal";

import "./_components/products.scss";

async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 300) },
    };
  }
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [coaFilter, setCoaFilter] = useState<"all" | "has_coa" | "no_coa">("all");
  // Completeness filters. On a 751-product catalogue the slow question is
  // rarely "where is X" — it is "what is not finished yet", and that was
  // previously unanswerable without opening every row.
  const [imageFilter, setImageFilter] = useState<"all" | "has_image" | "no_image">("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "has_price" | "no_price">("all");
  const [compoundFilter, setCompoundFilter] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  // Cards group by compound and lead with the artwork, which is the fastest way
  // to see what is missing across 751 products. The table stays for reading one
  // product in detail.
  const [view, setView] = useState<"cards" | "table">("table");

  const [createOpen, setCreateOpen] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageProductId, setManageProductId] = useState<string | null>(null);
  const [manageInitialTab, setManageInitialTab] = useState<TabType>("details");

  // ✅ Ensure portals only render after mount (document exists)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Fetches EVERY product by paging through the admin API (200/request cap),
  // not just the first page — the old single fixed-page fetch hid anything
  // past the first 100 rows. Filtering/search/pagination all happen client-side below.
  const fetchProducts = async (mode: "initial" | "refresh" = "refresh") => {
    mode === "initial" ? setIsLoading(true) : setIsRefreshing(true);

    try {
      const all: ProductRow[] = [];
      const limit = 200;
      let offset = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const url = new URL("/api/research-products/admin", window.location.origin);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("status", "all");

        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = await safeReadJson(res);

        if (!res.ok || !json?.ok)
          throw new Error(json?.error?.message ?? `Failed: ${res.status}`);

        const batch = (json.data ?? []) as ProductRow[];
        all.push(...batch);

        if (batch.length < limit) break;
        offset += limit;
      }

      setProducts(all);
      setError(null);

      if (mode !== "initial") toast.success(`Research chemicals refreshed (${all.length} total)`);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load products.");
    } finally {
      mode === "initial" ? setIsLoading(false) : setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 whenever a filter changes so we don't strand the user
  // on an out-of-range page.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, statusFilter, coaFilter, pageSize]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; slug: string }>();
    for (const p of products) {
      for (const c of p.categories ?? []) {
        if (!map.has(c.slug)) map.set(c.slug, c);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const withCoaCount = useMemo(() => products.filter((p) => (p.lab_reports?.length ?? 0) > 0).length, [products]);
  const withoutCoaCount = useMemo(() => products.filter((p) => (p.lab_reports?.length ?? 0) === 0).length, [products]);

  /** Distinct compounds/forms present, with counts, for the dropdowns. */
  const axes = useMemo(() => {
    const compounds = new Map<string, number>();
    const forms = new Map<string, number>();
    for (const p of products) {
      if (p.compound) compounds.set(p.compound, (compounds.get(p.compound) ?? 0) + 1);
      if (p.form) forms.set(p.form, (forms.get(p.form) ?? 0) + 1);
    }
    return {
      compounds: Array.from(compounds.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      forms: Array.from(forms.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [products]);

  /** How much of the catalogue is incomplete — the numbers on the gap chips. */
  const gaps = useMemo(() => ({
    noImage: products.filter((p) => (p.product_images?.length ?? 0) === 0).length,
    noCoa: products.filter((p) => (p.lab_reports?.length ?? 0) === 0).length,
    noPrice: products.filter((p) => (p.price_cents ?? 0) <= 0).length,
  }), [products]);

  const activeFilterCount =
    (statusFilter !== "all" ? 1 : 0) +
    (coaFilter !== "all" ? 1 : 0) +
    (imageFilter !== "all" ? 1 : 0) +
    (priceFilter !== "all" ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (compoundFilter ? 1 : 0) +
    (formFilter ? 1 : 0);

  const clearAllFilters = () => {
    setStatusFilter("all");
    setCoaFilter("all");
    setImageFilter("all");
    setPriceFilter("all");
    setCategoryFilter(null);
    setCompoundFilter(null);
    setFormFilter(null);
    setSearchQuery("");
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return products.filter((p) => {
      if (statusFilter !== "all" && (p.status ?? "draft").toLowerCase() !== statusFilter) return false;
      if (coaFilter === "has_coa" && (!p.lab_reports || p.lab_reports.length === 0)) return false;
      if (coaFilter === "no_coa" && (p.lab_reports && p.lab_reports.length > 0)) return false;
      const imgs = p.product_images?.length ?? 0;
      if (imageFilter === "has_image" && imgs === 0) return false;
      if (imageFilter === "no_image" && imgs > 0) return false;
      const priced = (p.price_cents ?? 0) > 0;
      if (priceFilter === "has_price" && !priced) return false;
      if (priceFilter === "no_price" && priced) return false;
      if (compoundFilter && p.compound !== compoundFilter) return false;
      if (formFilter && p.form !== formFilter) return false;
      if (categoryFilter && !(p.categories ?? []).some((c) => c.slug === categoryFilter)) return false;
      if (q) {
        // Compound and form are searchable too: "spray" or "bpc" should find
        // things whose title spells them differently.
        const hay = [p.title, p.slug, p.badge ?? "", p.status ?? "", p.compound ?? "", p.form ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, searchQuery, statusFilter, coaFilter, categoryFilter, imageFilter, priceFilter, compoundFilter, formFilter]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = (pageIndex - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  const openManage = (productId: string | null | undefined, initialTab: TabType = "details") => {
    if (!productId || typeof productId !== "string") {
      toast.error("Missing product id");
      return;
    }
    setManageProductId(productId);
    setManageInitialTab(initialTab);
    setManageOpen(true);
  };

  const openManageCOA = (product: ProductRow) => {
    openManage(product.id, "labdata");
  };

  return (
    <>
      <ShowcaseSection title="Research Chemicals Catalog">
        <div className="products-page space-y-6">
          <div className="products-header flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <ProductsSearchBar
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSubmitSearch={() => fetchProducts("refresh")}
            />

            <ProductActionBar
              isRefreshing={isRefreshing}
              onRefresh={() => fetchProducts("refresh")}
              onCreateProduct={() => setCreateOpen(true)}
              createLabel="Add Research Chemical"
            />
          </div>

          {/* Filters Toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Cards group by compound and lead with artwork; the table reads one
                product at a time. Same pair as Labs Inventory. */}
            <div className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
              {(["cards", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={
                    "rounded px-2.5 py-1 text-xs font-semibold capitalize transition " +
                    (view === v
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]")
                  }
                >
                  {v}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-xs font-bold text-[hsl(var(--foreground))]"
            >
              <SlidersHorizontal size={14} />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] font-extrabold">
                  {activeFilterCount}
                </span>
              )}
              {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {/* Active-only toggle switch — lives outside the collapsed panel so it's always one click away */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">Active</span>
              <button
                type="button"
                role="switch"
                aria-checked={statusFilter === "active"}
                onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  statusFilter === "active" ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--border))]"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    statusFilter === "active" ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </label>

            {/* Direct COA quick-filter */}
            <div className="flex items-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setCoaFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  coaFilter === "all"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold"
                    : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                }`}
              >
                All COAs
              </button>
              <button
                type="button"
                onClick={() => setCoaFilter(coaFilter === "has_coa" ? "all" : "has_coa")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  coaFilter === "has_coa"
                    ? "bg-emerald-500 text-white font-bold shadow-sm"
                    : "text-[hsl(var(--muted-foreground))] hover:text-emerald-600 dark:hover:text-emerald-400"
                }`}
              >
                <FlaskConical size={12} />
                Verified ({withCoaCount})
              </button>
              <button
                type="button"
                onClick={() => setCoaFilter(coaFilter === "no_coa" ? "all" : "no_coa")}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors ${
                  coaFilter === "no_coa"
                    ? "bg-amber-500 text-white font-bold shadow-sm"
                    : "text-[hsl(var(--muted-foreground))] hover:text-amber-600 dark:hover:text-amber-400"
                }`}
              >
                Missing ({withoutCoaCount})
              </button>
            </div>

            {(activeFilterCount > 0 || searchQuery.trim()) && (
              <button
                onClick={clearAllFilters}
                className="text-xs font-bold text-[hsl(var(--primary))] hover:underline"
              >
                Clear All Filters
              </button>
            )}
          </div>

          {/* Collapsible Filter Panel — hidden by default */}
          {showFilters && (
            <div className="space-y-4 p-4 rounded-2xl bg-[hsl(var(--card))/0.4] border border-[hsl(var(--border))/0.4]">
              {/* ── Gaps ──────────────────────────────────────────────────
                  On a catalogue this size the slow question is "what is not
                  finished", not "where is X". Each chip carries its own count
                  so the size of the job is visible before you click. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Needs work:</span>

                <button
                  type="button"
                  onClick={() => setImageFilter(imageFilter === "no_image" ? "all" : "no_image")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    imageFilter === "no_image"
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  No image ({gaps.noImage})
                </button>

                <button
                  type="button"
                  onClick={() => setCoaFilter(coaFilter === "no_coa" ? "all" : "no_coa")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    coaFilter === "no_coa"
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  No COA ({gaps.noCoa})
                </button>

                <button
                  type="button"
                  onClick={() => setPriceFilter(priceFilter === "no_price" ? "all" : "no_price")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    priceFilter === "no_price"
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  No price ({gaps.noPrice})
                </button>

                <button
                  type="button"
                  onClick={() => setImageFilter(imageFilter === "has_image" ? "all" : "has_image")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    imageFilter === "has_image"
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  Has image
                </button>
              </div>

              {/* ── Compound / form ───────────────────────────────────────
                  The two axes the catalogue is actually organised by. Counts
                  come from the loaded set, so an empty option cannot be picked. */}
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Compound
                  <select
                    value={compoundFilter ?? ""}
                    onChange={(e) => setCompoundFilter(e.target.value || null)}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs text-[hsl(var(--foreground))]"
                  >
                    <option value="">All ({axes.compounds.length})</option>
                    {axes.compounds.map(([name, n]) => (
                      <option key={name} value={name}>{name} ({n})</option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  Form
                  <select
                    value={formFilter ?? ""}
                    onChange={(e) => setFormFilter(e.target.value || null)}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs text-[hsl(var(--foreground))]"
                  >
                    <option value="">All forms</option>
                    {axes.forms.map(([name, n]) => (
                      <option key={name} value={name}>{name} ({n})</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Page size — free-form, type any number */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium">Products per page:</span>
                <input
                  type="number"
                  min={1}
                  value={pageSize === "all" ? filtered.length : pageSize}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPageSize(Number.isFinite(v) && v > 0 ? v : 1);
                  }}
                  disabled={pageSize === "all"}
                  className="w-20 px-2.5 py-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-xs font-semibold outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50"
                />
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--foreground))] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pageSize === "all"}
                    onChange={(e) => setPageSize(e.target.checked ? "all" : 50)}
                    className="w-3.5 h-3.5 rounded accent-[hsl(var(--primary))] cursor-pointer"
                  />
                  Show all ({filtered.length})
                </label>
              </div>

              {/* Category Tabs */}
              {categories.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCategoryFilter(null)}
                    className={`px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                      categoryFilter === null
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                        : "bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    }`}
                  >
                    All Categories ({products.length})
                  </button>

                  {categories.map((c) => {
                    const count = products.filter((p) => (p.categories ?? []).some((pc) => pc.slug === c.slug)).length;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCategoryFilter(c.slug)}
                        className={`px-4 py-2 rounded-full text-xs font-extrabold uppercase tracking-wider transition-all ${
                          categoryFilter === c.slug
                            ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                            : "bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        }`}
                      >
                        {c.name} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isLoading && <LoadingState message="Loading research chemicals..." />}
          {error && (
            <ErrorAlert message={error} onDismiss={() => setError(null)} />
          )}

          {!isLoading && !error && (
            view === "cards" ? (
              <ProductsCardGrid
                products={paginated}
                onManage={(p) => openManage(p?.id, "details")}
                onManageCOA={openManageCOA}
              />
            ) : (
            <ProductsTable
              products={paginated}
              allProductsCount={filtered.length}
              isRefreshing={isRefreshing}
              onManage={(p) => openManage(p?.id, "details")}
              onManageCOA={openManageCOA}
              onStatusChange={async (p, newStatus) => {
                if (!p?.id) {
                  toast.error("Missing product id");
                  return;
                }
                try {
                  const res = await fetch(`/api/research-products/admin/${p.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: newStatus }),
                  });
                  const json = await safeReadJson(res);
                  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Status update failed");
                  toast.success(`Status set to ${newStatus}`);
                  await fetchProducts("refresh");
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to update status");
                }
              }}
              onToggleFeatured={async (p, newFeatured) => {
                if (!p?.id) {
                  toast.error("Missing product id");
                  return;
                }
                try {
                  const res = await fetch(`/api/research-products/admin/${p.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_featured: newFeatured }),
                  });
                  const json = await safeReadJson(res);
                  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? "Featured update failed");
                  toast.success(newFeatured ? `"${p.title}" set to Featured ⭐` : `"${p.title}" unfeatured`);
                  await fetchProducts("refresh");
                } catch (e: any) {
                  toast.error(e?.message ?? "Failed to update featured state");
                }
              }}
              onArchive={async (p) => {
                if (!p?.id) return toast.error("Missing product id");
                if (!confirm(`Archive "${p.title}"?`)) return;

                try {
                  const res = await fetch(`/api/research-products/admin/${p.id}`, {
                    method: "DELETE",
                  });
                  const json = await safeReadJson(res);
                  if (!res.ok || !json?.ok)
                    throw new Error(json?.error?.message ?? "Archive failed");
                  toast.success("Archived");
                  fetchProducts("refresh");
                } catch (e: any) {
                  toast.error(e?.message ?? "Archive failed");
                }
              }}
            />
            )
          )}

          {/* Pagination Controls — Prev/Next only, no per-page number buttons */}
          {!isLoading && !error && pageSize !== "all" && totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                disabled={pageIndex <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-xs font-bold text-[hsl(var(--foreground))] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[hsl(var(--muted))]"
              >
                ← Previous
              </button>

              <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">
                Page {pageIndex} of {totalPages}
              </span>

              <button
                disabled={pageIndex >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-xs font-bold text-[hsl(var(--foreground))] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[hsl(var(--muted))]"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </ShowcaseSection>

      {/* ✅ Portals: prevents cut-off/clipping from parent layout/overflow/transforms */}
      {mounted &&
        createPortal(
          <>
            <CreateProductModal
              open={createOpen}
              onOpenChange={setCreateOpen}
              onCreated={async () => {
                setCreateOpen(false);
                toast.success("Research chemical created");
                await fetchProducts("refresh");
              }}
            />

            <ProductModal
              key={manageProductId ?? "no-product"} // ✅ remount per product (avoids stale layout)
              open={manageOpen}
              onOpenChange={(v) => {
                setManageOpen(v);
                if (!v) {
                  setManageProductId(null);
                  setManageInitialTab("details");
                }
              }}
              productId={manageProductId}
              initialTab={manageInitialTab}
              onChanged={() => fetchProducts("refresh")}
              title="Manage Research Chemical"
            />
          </>,
          document.body
        )}
    </>
  );
}
