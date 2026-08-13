"use client";

import Link from "next/link";
import { getPrimaryImageUrl, pickPrimaryImage } from "@/lib/images";
import { formatPricePerMg } from "@/lib/pricing";
import { SmartProductImage } from "./SmartProductImage";

export type ResearchProductCardProduct = {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  compare_at_price_cents?: number | null;
  currency?: string;
  badge?: string | null;
  dosage_label?: string | null;
  is_featured?: boolean;
  product_images?: {
    bucket_name: string | null;
    object_path: string | null;
    alt_text?: string | null;
    sort_order?: number | null;
    position?: number | null;
    is_primary?: boolean | null;
    is_public?: boolean | null;
  }[];
};

function formatMoney(price_cents: number, currency: string) {
  if (!price_cents || price_cents <= 0) return "Contact for pricing";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "USD",
  }).format(price_cents / 100);
}

export function ResearchProductCard({ product }: { product: ResearchProductCardProduct }) {
  const imageUrl = getPrimaryImageUrl(product.product_images);
  const primary = pickPrimaryImage(product.product_images);
  const alt = primary?.alt_text || product.title || "Research chemical";
  const pricePerMg = formatPricePerMg(product.price_cents, product.dosage_label, product.currency || "USD");

  return (
    <Link
      href={`/${product.slug}`}
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

        {(pricePerMg || product.dosage_label) && (
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {pricePerMg ? (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
                {pricePerMg}
              </span>
            ) : null}
            {product.dosage_label ? (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[hsl(var(--secondary)/0.25)] text-[hsl(var(--secondary-foreground))]">
                {product.dosage_label}
              </span>
            ) : null}
          </div>
        )}

        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
          {formatMoney(product.price_cents, product.currency || "USD")}
          {product.compare_at_price_cents ? (
            <span className="ml-2 line-through opacity-70">
              {formatMoney(product.compare_at_price_cents, product.currency || "USD")}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
