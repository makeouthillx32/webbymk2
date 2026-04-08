// components/POS/ProductTile/index.tsx
"use client";

import { ItemTile } from "../ItemTile";
import type { POSProduct } from "../types";

interface ProductTileProps {
  product: POSProduct;
  onSelect: (product: POSProduct) => void;
}

function stockBadge(product: POSProduct): { label: string; variant: "warning" | "danger" } | null {
  const tracked = product.variants.filter((v) => v.track_inventory);
  if (!tracked.length) return null;
  const total = tracked.reduce((s, v) => s + v.inventory_qty, 0);
  if (total === 0) return { label: "Out of stock", variant: "danger" };
  if (total <= 3) return { label: `${total} left`, variant: "warning" };
  return null;
}

export function ProductTile({ product, onSelect }: ProductTileProps) {
  const badge = stockBadge(product);
  const isSoldOut = badge?.label === "Out of stock";

  // Use lowest variant price if variants differ
  const minPrice = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price_cents))
    : product.price_cents;

  const hasMultipleVariants =
    product.variants.length > 1 ||
    (product.variants.length === 1 && product.variants[0]?.title !== "Default");

  return (
    <ItemTile
      label={product.title}
      sublabel={hasMultipleVariants ? `${product.variants.length} variants` : null}
      imageUrl={product.image_url}
      price={minPrice}
      badge={badge?.label ?? null}
      badgeVariant={badge?.variant ?? "default"}
      isDisabled={isSoldOut}
      onClick={() => onSelect(product)}
    />
  );
}