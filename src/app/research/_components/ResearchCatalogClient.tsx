"use client";

import { useMemo, useState } from "react";
import { ResearchProductCard, type ResearchProductCardProduct } from "@/components/shop/_components/ResearchProductCard";
import { FlaskConical } from "lucide-react";

type CatalogProduct = ResearchProductCardProduct & {
  is_featured?: boolean;
  created_at?: string;
  category_slugs: string[];
};

type Category = { id: string; slug: string; name: string };

type SortOption = "featured" | "newest" | "price-asc" | "price-desc" | "title";

export default function ResearchCatalogClient({
  products,
  categories,
}: {
  products: CatalogProduct[];
  categories: Category[];
}) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filtered = useMemo(() => {
    const list = activeCategory
      ? products.filter((p) => p.category_slugs.includes(activeCategory))
      : products;

    const sorted = [...list];
    switch (sortBy) {
      case "featured":
        return sorted.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
      case "price-asc":
        return sorted.sort((a, b) => a.price_cents - b.price_cents);
      case "price-desc":
        return sorted.sort((a, b) => b.price_cents - a.price_cents);
      case "title":
        return sorted.sort((a, b) => a.title.localeCompare(b.title));
      case "newest":
      default:
        return sorted.sort(
          (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
        );
    }
  }, [products, activeCategory, sortBy]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold flex items-center gap-2">
          <FlaskConical size={28} /> Research Chemicals
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] mt-2">
          For laboratory research use only. Not for human consumption.
        </p>
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-full border text-sm ${
              activeCategory === null
                ? "border-[var(--sidebar-primary)] text-[var(--sidebar-primary)]"
                : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCategory(c.slug)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                activeCategory === c.slug
                  ? "border-[var(--sidebar-primary)] text-[var(--sidebar-primary)]"
                  : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          {filtered.length} {filtered.length === 1 ? "product" : "products"}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm font-medium">
            Sort by:
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="border border-[var(--border)] bg-[var(--background)] rounded-md px-3 py-1.5 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="featured">Featured</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="title">Name: A-Z</option>
          </select>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((product) => (
            <ResearchProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-lg">
          <FlaskConical size={32} className="mx-auto mb-3 text-[var(--muted-foreground)]" />
          <h3 className="text-lg font-semibold mb-1">No products found</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {activeCategory ? "Try a different category, or view all products." : "Check back soon."}
          </p>
        </div>
      )}
    </main>
  );
}
