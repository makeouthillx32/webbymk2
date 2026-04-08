// components/POS/Favorites/index.tsx
"use client";

import { useEffect, useState } from "react";
import { Star } from "../icons";
import { ProductTile } from "../ProductTile";
import type { POSProduct } from "../types";
import "./styles.scss";

const STORAGE_KEY = "dcg_pos_favorites";

interface FavoritesProps {
  products: POSProduct[];
  onSelect: (product: POSProduct) => void;
  onManage: () => void; // switches to Library tab so user can find products to star
}

export function Favorites({ products, onSelect, onManage }: FavoritesProps) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavoriteIds(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  const favoriteProducts = favoriteIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as POSProduct[];

  if (!favoriteProducts.length) {
    return (
      <div className="favorites-empty">
        <Star size={40} className="favorites-empty__icon" />
        <p className="favorites-empty__title">No favorites yet</p>
        <p className="favorites-empty__sub">
          Star products in the Library tab to pin them here for fast access.
        </p>
        <button
          type="button"
          className="favorites-empty__btn"
          onClick={onManage}
        >
          Browse Library
        </button>
      </div>
    );
  }

  return (
    <div className="favorites-grid">
      {favoriteProducts.map((product) => (
        <ProductTile key={product.id} product={product} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ── Exported hook so Library can toggle favorites ──────────────────────────────

export function useFavorites() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setIds(JSON.parse(stored));
    } catch {}
  }, []);

  function toggle(productId: string) {
    setIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function isFavorite(productId: string) {
    return ids.includes(productId);
  }

  return { ids, toggle, isFavorite };
}