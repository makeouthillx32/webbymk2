// components/POS/CategoryTile/index.tsx
"use client";

import { ItemTile } from "../ItemTile";
import "./styles.scss";

interface CategoryTileProps {
  id: string;
  name: string;
  productCount?: number;
  isActive: boolean;
  onToggle: (id: string | null) => void;
}

// Simple category icons by name keyword
function categoryIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("hat") || n.includes("cap")) return "🤠";
  if (n.includes("boot") || n.includes("shoe")) return "🥾";
  if (n.includes("shirt") || n.includes("top") || n.includes("tee")) return "👕";
  if (n.includes("belt")) return "🟤";
  if (n.includes("jean") || n.includes("denim") || n.includes("pant")) return "👖";
  if (n.includes("jewelry") || n.includes("jewel") || n.includes("necklace")) return "📿";
  if (n.includes("bag") || n.includes("purse") || n.includes("tote")) return "👜";
  if (n.includes("dress")) return "👗";
  if (n.includes("jacket") || n.includes("vest") || n.includes("coat")) return "🧥";
  if (n.includes("gift") || n.includes("card")) return "🎁";
  if (n.includes("sale") || n.includes("clearance")) return "🏷️";
  if (n.includes("new")) return "✨";
  return "🏷️";
}

export function CategoryTile({ id, name, productCount, isActive, onToggle }: CategoryTileProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(isActive ? null : id)}
      className={`category-tile ${isActive ? "category-tile--active" : ""}`}
    >
      <span className="category-tile__icon">{categoryIcon(name)}</span>
      <span className="category-tile__name">{name}</span>
      {productCount != null && (
        <span className="category-tile__count">{productCount}</span>
      )}
    </button>
  );
}