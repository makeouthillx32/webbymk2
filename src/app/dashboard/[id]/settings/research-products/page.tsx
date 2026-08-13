// app/dashboard/[id]/settings/products/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import { ShowcaseSection } from "@/components/Layouts/dashboard/sidebar/showcase-section";
import { toast } from "react-hot-toast";

import LoadingState from "./_components/LoadingState";
import ErrorAlert from "./_components/ErrorAlert";
import ProductsSearchBar from "./_components/ProductsSearchBar";
import ProductActionBar from "./_components/ProductActionBar";
import ProductsTable, { ProductRow } from "./_components/ProductsTable";

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
  const [pageSize, setPageSize] = useState<number | "all">(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageProductId, setManageProductId] = useState<string | null>(null);

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
  }, [searchQuery, categoryFilter, statusFilter, pageSize]);

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; slug: string }>();
    for (const p of products) {
      for (const c of p.categories ?? []) {
        if (!map.has(c.slug)) map.set(c.slug, c);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return products.filter((p) => {
      if (statusFilter !== "all" && (p.status ?? "draft").toLowerCase() !== statusFilter) return false;
      if (categoryFilter && !(p.categories ?? []).some((c) => c.slug === categoryFilter)) return false;
      if (q) {
        const hay = [p.title, p.slug, p.badge ?? "", p.status ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, searchQuery, statusFilter, categoryFilter]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);

  const paginated = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = (pageIndex - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  const openManage = (productId: string | null | undefined) => {
    if (!productId || typeof productId !== "string") {
      toast.error("Missing product id");
      return;
    }
    setManageProductId(productId);
    setManageOpen(true);
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-xs font-bold text-[hsl(var(--foreground))]"
            >
              <SlidersHorizontal size={14} />
              Filters
              {(categoryFilter || statusFilter !== "all") && (
                <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-[10px] font-extrabold">
                  {[categoryFilter, statusFilter !== "all" ? statusFilter : null].filter(Boolean).length}
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

            {(categoryFilter || statusFilter !== "all" || searchQuery.trim()) && (
              <button
                onClick={() => {
                  setCategoryFilter(null);
                  setStatusFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs font-bold text-[hsl(var(--primary))] hover:underline"
              >
                Clear All Filters
              </button>
            )}
          </div>

          {/* Collapsible Filter Panel — hidden by default */}
          {showFilters && (
            <div className="space-y-4 p-4 rounded-2xl bg-[hsl(var(--card))/0.4] border border-[hsl(var(--border))/0.4]">
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
            <ProductsTable
              products={paginated}
              allProductsCount={filtered.length}
              isRefreshing={isRefreshing}
              onManage={(p) => openManage(p?.id)}
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
                if (!v) setManageProductId(null);
              }}
              productId={manageProductId}
              onChanged={() => fetchProducts("refresh")}
              title="Manage Research Chemical"
            />
          </>,
          document.body
        )}
    </>
  );
}
