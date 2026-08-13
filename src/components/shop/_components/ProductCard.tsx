"use client";

import Link from "next/link";
import type { LandingProduct } from "./useLandingData";
import { getPrimaryImageUrl, pickPrimaryImage } from "@/lib/images";
import { SmartProductImage } from "./SmartProductImage";

function formatMoney(price_cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format((price_cents ?? 0) / 100);
}

export function LandingProductCard({ product }: { product: LandingProduct }) {
  const imageUrl = getPrimaryImageUrl(product.product_images);
  const primary = pickPrimaryImage(product.product_images);
  const alt = primary?.alt_text || product.title || "Product image";

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group rounded-[calc(var(--radius)*3)] bg-transparent hover:bg-[hsl(var(--card))/0.4] transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 flex flex-col justify-between"
    >
      <SmartProductImage src={imageUrl} alt={alt} sizes="(max-width: 768px) 50vw, 25vw" />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-semibold text-sm leading-snug">{product.title}</div>

          {product.badge ? (
            <span className="shrink-0 text-[10px] px-2 py-1 rounded-full border border-[var(--border)] bg-[var(--card)]">
              {product.badge}
            </span>
          ) : null}
        </div>

        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
          {formatMoney(product.price_cents, product.currency)}
          {product.compare_at_price_cents ? (
            <span className="ml-2 line-through opacity-70">
              {formatMoney(product.compare_at_price_cents, product.currency)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}