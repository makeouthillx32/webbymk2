"use client";

import Link from "next/link";
import Image from "next/image";
import type { LandingProduct } from "./useLandingData";
import { getPrimaryImageUrl, pickPrimaryImage } from "@/lib/images";

function formatMoney(price_cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format((price_cents ?? 0) / 100);
}

export function LandingProductCard({ product }: { product: LandingProduct }) {
  // Force optimized delivery (webp/avif) via Next optimizer
  const imageUrl = getPrimaryImageUrl(product.product_images, {
    optimized: true,
    width: 900,
    quality: 82,
  });

  const primary = pickPrimaryImage(product.product_images);
  const alt = primary?.alt_text || product.title || "Product image";

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group rounded-xl border border-[var(--border)] bg-[var(--background)] overflow-hidden"
    >
      <div className="relative aspect-square bg-[var(--sidebar)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={alt}
            fill
            // since we're serving a single optimized URL, keep sizes for layout
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-xs text-[var(--muted-foreground)] px-3 py-1 rounded-md border border-[var(--border)] bg-[var(--card)]">
              No image
            </div>
          </div>
        )}
      </div>

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