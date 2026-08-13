// src/components/research/ResearchCatalogClient.tsx
//
// Advanced, theme-driven Research Chemicals Catalog & Search component.
// Features instant search, multi-faceted category filtering, in-stock toggle,
// price range filters, sorting, page-size selection, and pagination.
"use client";

import { useMemo, useState } from "react";
import {
  ResearchProductCard,
  type ResearchProductCardProduct,
} from "@/components/shop/_components/ResearchProductCard";
import {
  FlaskConical,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
} from "lucide-react";

export type CatalogProduct = ResearchProductCardProduct & {
  is_featured?: boolean;
  created_at?: string;
  category_slugs: string[];
  track_inventory?: boolean;
  inventory_quantity?: number;
};

export type CatalogCategory = { id: string; slug: string; name: string };

type SortOption = "newest" | "featured" | "price-asc" | "price-desc" | "title";

export default function ResearchCatalogClient({
  products,
  categories,
  initialCategory = null,
  heading = "Research Catalog",
  description = "High-purity research compounds. For laboratory and scientific research use only.",
  showSearchInput = true,
  showCategoryNavigation = true,
  initialQuery = "",
}: {
  products: CatalogProduct[];
  categories: CatalogCategory[];
  initialCategory?: string | null;
  heading?: string;
  description?: string;
  showSearchInput?: boolean;
  showCategoryNavigation?: boolean;
  initialQuery?: string;
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialCategory,
  );
  const [query, setQuery] = useState(initialQuery);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [pageSize, setPageSize] = useState<number | "all">(48);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Calculate price boundaries from available products
  const priceStats = useMemo(() => {
    if (products.length === 0) return { min: 0, max: 500 };
    const prices = products.map((p) => (p.price_cents ?? 0) / 100);
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    };
  }, [products]);

  // Master Filter & Sort Logic
  const filtered = useMemo(() => {
    let list = [...products];

    // Category Filter
    if (activeCategory) {
      list = list.filter((p) => p.category_slugs.includes(activeCategory));
    }

    // Search Query Filter (Title, Slug, Badge)
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const titleMatch = p.title.toLowerCase().includes(q);
        const slugMatch = p.slug.toLowerCase().includes(q);
        const badgeMatch = (p.badge ?? "").toLowerCase().includes(q);
        return titleMatch || slugMatch || badgeMatch;
      });
    }

    // In-Stock Only Filter
    if (inStockOnly) {
      list = list.filter((p) => {
        if (!p.track_inventory) return true;
        return (p.inventory_quantity ?? 0) > 0;
      });
    }

    // On Sale Filter
    if (onSaleOnly) {
      list = list.filter((p) => {
        const compare = p.compare_at_price_cents ?? 0;
        return compare > p.price_cents;
      });
    }

    // Min Price Filter
    const parsedMin = parseFloat(minPrice);
    if (!isNaN(parsedMin)) {
      list = list.filter((p) => (p.price_cents ?? 0) / 100 >= parsedMin);
    }

    // Max Price Filter
    const parsedMax = parseFloat(maxPrice);
    if (!isNaN(parsedMax)) {
      list = list.filter((p) => (p.price_cents ?? 0) / 100 <= parsedMax);
    }

    // Sorting
    switch (sortBy) {
      case "featured":
        list.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
        break;
      case "price-asc":
        list.sort((a, b) => a.price_cents - b.price_cents);
        break;
      case "price-desc":
        list.sort((a, b) => b.price_cents - a.price_cents);
        break;
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "newest":
      default:
        list.sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() -
            new Date(a.created_at ?? 0).getTime(),
        );
        break;
    }

    return list;
  }, [
    products,
    activeCategory,
    query,
    inStockOnly,
    onSaleOnly,
    minPrice,
    maxPrice,
    sortBy,
  ]);

  // Reset to page 1 whenever filters change
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (showCategoryNavigation && activeCategory) count++;
    if (query.trim()) count++;
    if (inStockOnly) count++;
    if (onSaleOnly) count++;
    if (minPrice !== "") count++;
    if (maxPrice !== "") count++;
    return count;
  }, [
    activeCategory,
    query,
    inStockOnly,
    onSaleOnly,
    minPrice,
    maxPrice,
    showCategoryNavigation,
  ]);

  const clearAllFilters = () => {
    setActiveCategory(showCategoryNavigation ? null : initialCategory);
    setQuery("");
    setInStockOnly(false);
    setOnSaleOnly(false);
    setMinPrice("");
    setMaxPrice("");
    setCurrentPage(1);
  };

  // Pagination calculations
  const totalProducts = filtered.length;
  const effectivePageSize = pageSize === "all" ? totalProducts : pageSize;
  const totalPages = Math.ceil(totalProducts / (effectivePageSize || 1));
  const pageIndex = Math.min(currentPage, Math.max(1, totalPages));

  const paginatedProducts = useMemo(() => {
    if (pageSize === "all") return filtered;
    const start = (pageIndex - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageIndex, pageSize]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="mb-8 border-b border-[hsl(var(--border))/0.4] pb-6">
        <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-[hsl(var(--foreground))] sm:text-4xl lg:text-5xl">
          <FlaskConical className="text-[hsl(var(--primary))]" size={36} />
          {heading}
        </h1>
        {description && (
          <p className="mt-2.5 max-w-3xl text-sm text-[hsl(var(--muted-foreground))] sm:text-base">
            {description}
          </p>
        )}
      </div>

      {/* ── Search Bar & Quick Controls ─────────────────────────────────── */}
      <div className="mb-6 flex flex-col items-stretch justify-between gap-4 lg:flex-row lg:items-center">
        {/* Search Input */}
        {showSearchInput && (
          <div className="relative max-w-xl flex-1">
            <Search
              size={18}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search by compound name, category, or spec…"
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-3 pl-10 pr-10 text-sm text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] transition-all focus:border-[hsl(var(--primary))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))/0.3]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Sort & Filter Toggle Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mobile Filter Toggle */}
          <button
            onClick={() => setShowFiltersMobile(!showFiltersMobile)}
            className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--foreground))] lg:hidden"
          >
            <SlidersHorizontal size={16} />
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5">
            <ArrowUpDown
              size={15}
              className="text-[hsl(var(--muted-foreground))]"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="cursor-pointer bg-transparent text-sm font-semibold text-[hsl(var(--foreground))] outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="featured">Featured First</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="title">Name: A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Category Tabs Row ────────────────────────────────────────────── */}
      {showCategoryNavigation && categories.length > 0 && (
        <section
          className="mb-6 border-b border-[hsl(var(--border))/0.4] pb-4"
          aria-labelledby="catalog-categories-heading"
        >
          <h2
            id="catalog-categories-heading"
            className="mb-3 text-xs font-extrabold uppercase tracking-wider text-[hsl(var(--muted-foreground))]"
          >
            Browse by category
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setActiveCategory(null);
                setCurrentPage(1);
              }}
              className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all ${
                activeCategory === null
                  ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                  : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              All Compounds ({products.length})
            </button>

            {categories.map((c) => {
              const count = products.filter((p) =>
                p.category_slugs.includes(c.slug),
              ).length;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveCategory(c.slug);
                    setCurrentPage(1);
                  }}
                  className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition-all ${
                    activeCategory === c.slug
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm"
                      : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  }`}
                >
                  {c.name} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Secondary Filter Bar (In-Stock, On Sale, Price Range) ───────── */}
      <div
        className={`mb-6 items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--border))/0.4] bg-[hsl(var(--card))/0.4] p-4 lg:flex ${showFiltersMobile ? "block" : "hidden lg:flex"}`}
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* In-Stock Only Toggle */}
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.target.checked);
                setCurrentPage(1);
              }}
              className="h-4 w-4 cursor-pointer rounded accent-[hsl(var(--primary))]"
            />
            In Stock Only
          </label>

          {/* On Sale Toggle */}
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs font-bold uppercase tracking-wider text-[hsl(var(--foreground))]">
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => {
                setOnSaleOnly(e.target.checked);
                setCurrentPage(1);
              }}
              className="h-4 w-4 cursor-pointer rounded accent-[hsl(var(--primary))]"
            />
            On Sale
          </label>

          {/* Price Range Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Price ($):
            </span>
            <input
              type="number"
              placeholder={`Min ($${priceStats.min})`}
              value={minPrice}
              onChange={(e) => {
                setMinPrice(e.target.value);
                setCurrentPage(1);
              }}
              className="w-24 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1 text-xs font-semibold outline-none focus:border-[hsl(var(--primary))]"
            />
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              –
            </span>
            <input
              type="number"
              placeholder={`Max ($${priceStats.max})`}
              value={maxPrice}
              onChange={(e) => {
                setMaxPrice(e.target.value);
                setCurrentPage(1);
              }}
              className="w-24 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1 text-xs font-semibold outline-none focus:border-[hsl(var(--primary))]"
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="mt-3 flex items-center gap-1 text-xs font-bold text-[hsl(var(--primary))] hover:underline lg:mt-0"
          >
            <X size={14} /> Clear All Filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* ── Active Filter Badges ─────────────────────────────────────────── */}
      {activeFilterCount > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            Active:
          </span>
          {showCategoryNavigation && activeCategory && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/0.15] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
              Category:{" "}
              {categories.find((c) => c.slug === activeCategory)?.name ||
                activeCategory}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setActiveCategory(null)}
              />
            </span>
          )}
          {query.trim() && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/0.15] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
              Search: "{query}"
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setQuery("")}
              />
            </span>
          )}
          {inStockOnly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/0.15] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
              In Stock Only
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setInStockOnly(false)}
              />
            </span>
          )}
          {onSaleOnly && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/0.15] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
              On Sale
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => setOnSaleOnly(false)}
              />
            </span>
          )}
          {(minPrice || maxPrice) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--primary))/0.15] px-3 py-1 text-xs font-bold text-[hsl(var(--primary))]">
              Price: ${minPrice || "0"} – ${maxPrice || "∞"}
              <X
                size={12}
                className="cursor-pointer"
                onClick={() => {
                  setMinPrice("");
                  setMaxPrice("");
                }}
              />
            </span>
          )}
        </div>
      )}

      {/* ── Product Status Count Bar ────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Showing{" "}
          {paginatedProducts.length > 0
            ? (pageIndex - 1) *
                (pageSize === "all" ? totalProducts : pageSize) +
              1
            : 0}
          –
          {Math.min(
            pageIndex * (pageSize === "all" ? totalProducts : pageSize),
            totalProducts,
          )}{" "}
          of {totalProducts} Products
        </p>
      </div>

      {/* ── Product Cards Grid ──────────────────────────────────────────── */}
      {paginatedProducts.length > 0 ? (
        <div className="mb-12 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
          {paginatedProducts.map((product) => (
            <ResearchProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card))/0.2] py-20 text-center">
          <FlaskConical
            size={40}
            className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]"
          />
          <h3 className="mb-1 text-xl font-bold text-[hsl(var(--foreground))]">
            No compounds match your filter
          </h3>
          <p className="mx-auto mb-6 max-w-md text-sm text-[hsl(var(--muted-foreground))]">
            Try adjusting your search criteria, clearing price filters, or
            switching category tabs.
          </p>
          <button
            onClick={clearAllFilters}
            className="rounded-full bg-[hsl(var(--primary))] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary-foreground))]"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* ── Pagination Controls ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 border-t border-[hsl(var(--border))/0.4] pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 self-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 sm:order-2">
          <label
            htmlFor="catalog-page-size"
            className="text-xs font-medium text-[hsl(var(--muted-foreground))]"
          >
            Products per page:
          </label>
          <select
            id="catalog-page-size"
            value={pageSize}
            onChange={(e) => {
              const val = e.target.value;
              setPageSize(val === "all" ? "all" : parseInt(val, 10));
              setCurrentPage(1);
            }}
            className="cursor-pointer bg-transparent text-sm font-semibold text-[hsl(var(--foreground))] outline-none"
          >
            <option value={24}>24</option>
            <option value={48}>48</option>
            <option value={96}>96</option>
            <option value="all">All ({totalProducts})</option>
          </select>
        </div>

        {pageSize !== "all" && totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:order-1">
            <button
              disabled={pageIndex <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-bold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`h-9 w-9 rounded-lg text-xs font-extrabold transition-all ${
                    pageNum === pageIndex
                      ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                      : "border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              disabled={pageIndex >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-bold text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        ) : (
          <p className="text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:order-1">
            {totalProducts} {totalProducts === 1 ? "product" : "products"}
          </p>
        )}
      </div>
    </main>
  );
}
