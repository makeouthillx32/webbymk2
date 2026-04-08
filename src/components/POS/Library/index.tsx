// components/POS/Library/index.tsx
"use client";

import { useMemo, useState } from "react";
import { ProductTile } from "../ProductTile";
import { CategoryTile } from "../CategoryTile";
import { CollectionTile } from "../CollectionTile";
import { ProductSearch } from "../ProductSearch";
import { useFavorites } from "../Favorites";
import type { POSProduct } from "../types";
import { Star } from "../icons";
import "./styles.scss";

interface LibraryProps {
  products: POSProduct[];
  onSelect: (product: POSProduct) => void;
}

type FilterMode = "all" | "category" | "collection";

export function Library({ products, onSelect }: LibraryProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const { toggle: toggleFav, isFavorite } = useFavorites();

  // Derive unique categories and collections from products
  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    products.forEach((p) => {
      p.categories.forEach((c) => {
        const existing = map.get(c.id);
        map.set(c.id, { id: c.id, name: c.name, count: (existing?.count ?? 0) + 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const collections = useMemo(() => {
    const map = new Map<string, { id: string; title: string; count: number }>();
    products.forEach((p) => {
      p.collections.forEach((c) => {
        const existing = map.get(c.id);
        map.set(c.id, { id: c.id, title: c.title, count: (existing?.count ?? 0) + 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [products]);

  // Filtered products
  const filtered = useMemo(() => {
    let list = products;
    const q = search.trim().toLowerCase();

    if (q) {
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.variants.some(
            (v) => v.title.toLowerCase().includes(q) || (v.sku ?? "").toLowerCase().includes(q)
          )
      );
    }

    if (activeCategory) {
      list = list.filter((p) => p.categories.some((c) => c.id === activeCategory));
    }

    if (activeCollection) {
      list = list.filter((p) => p.collections.some((c) => c.id === activeCollection));
    }

    return list;
  }, [products, search, activeCategory, activeCollection]);

  function handleCategoryToggle(id: string | null) {
    setActiveCategory(id);
    setActiveCollection(null);
  }

  function handleCollectionToggle(id: string | null) {
    setActiveCollection(id);
    setActiveCategory(null);
  }

  return (
    <div className="pos-library">
      {/* Search */}
      <div className="pos-library__search">
        <ProductSearch
          value={search}
          onChange={setSearch}
          placeholder="Search products, SKUs…"
        />
      </div>

      {/* Filter rows */}
      {(categories.length > 0 || collections.length > 0) && (
        <div className="pos-library__filters">
          {/* All chip */}
          <div className="pos-library__filter-row">
            <button
              type="button"
              className={`pos-library__all-chip ${!activeCategory && !activeCollection ? "pos-library__all-chip--active" : ""}`}
              onClick={() => { setActiveCategory(null); setActiveCollection(null); }}
            >
              All
            </button>

            {/* Collections */}
            {collections.map((col) => (
              <CollectionTile
                key={col.id}
                id={col.id}
                title={col.title}
                productCount={col.count}
                isActive={activeCollection === col.id}
                onToggle={handleCollectionToggle}
              />
            ))}

            {/* Categories */}
            {categories.map((cat) => (
              <CategoryTile
                key={cat.id}
                id={cat.id}
                name={cat.name}
                productCount={cat.count}
                isActive={activeCategory === cat.id}
                onToggle={handleCategoryToggle}
              />
            ))}
          </div>
        </div>
      )}

      {/* Product grid */}
      <div className="pos-library__grid">
        {filtered.length === 0 ? (
          <div className="pos-library__empty">
            <p>No products found</p>
          </div>
        ) : (
          filtered.map((product) => (
            <div key={product.id} className="pos-library__tile-wrap">
              <ProductTile product={product} onSelect={onSelect} />
              {/* Star / favorite toggle */}
              <button
                type="button"
                className={`pos-library__star ${isFavorite(product.id) ? "pos-library__star--on" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleFav(product.id); }}
                aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}
              >
                <Star size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}