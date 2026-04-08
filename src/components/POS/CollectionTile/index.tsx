// components/POS/CollectionTile/index.tsx
"use client";

import "./styles.scss";

interface CollectionTileProps {
  id: string;
  title: string;
  productCount?: number;
  isActive: boolean;
  onToggle: (id: string | null) => void;
}

// Collection color accent by keyword
function collectionAccent(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("valentine") || t.includes("love")) return "#e11d48";
  if (t.includes("new") || t.includes("arrival")) return "#0ea5e9";
  if (t.includes("best") || t.includes("sell") || t.includes("popular")) return "#f59e0b";
  if (t.includes("sale") || t.includes("clear")) return "#ef4444";
  if (t.includes("holiday") || t.includes("christmas")) return "#16a34a";
  if (t.includes("summer")) return "#f97316";
  if (t.includes("winter")) return "#6366f1";
  if (t.includes("featured")) return "#8b5cf6";
  return "hsl(var(--primary))";
}

export function CollectionTile({ id, title, productCount, isActive, onToggle }: CollectionTileProps) {
  const accent = collectionAccent(title);

  return (
    <button
      type="button"
      onClick={() => onToggle(isActive ? null : id)}
      className={`collection-tile ${isActive ? "collection-tile--active" : ""}`}
      style={{ "--collection-accent": accent } as React.CSSProperties}
    >
      <span
        className="collection-tile__dot"
        style={{ background: accent }}
      />
      <span className="collection-tile__title">{title}</span>
      {productCount != null && (
        <span className="collection-tile__count">{productCount}</span>
      )}
    </button>
  );
}