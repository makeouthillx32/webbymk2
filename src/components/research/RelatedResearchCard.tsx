"use client";

// "Commonly Researched With" card — a richer take on the plain catalog card
// for the PDP's related-products rail. Adds an eyebrow label + one-line
// rationale so a related item reads as "why this, not just what this."
// The eyebrow/blurb are derived entirely from existing fields (tags + slug
// convention) — no new schema, per the "existing fields only" call made
// earlier for the Product Details section.

import Link from "next/link";
import { getPrimaryImageUrl, pickPrimaryImage } from "@/lib/images";
import { SmartProductImage } from "@/components/shop/_components/SmartProductImage";

export type RelatedResearchCardProduct = {
  id: string;
  slug: string;
  title: string;
  price_cents: number;
  compare_at_price_cents?: number | null;
  currency?: string;
  badge?: string | null;
  dosage_label?: string | null;
  tags?: string[] | null;
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

const PREP_STYLE: Record<string, { eyebrow: string; blurb: string }> = {
  capsules: {
    eyebrow: "Encapsulated Products",
    blurb: "Another research compound supplied in a ready-to-use capsule format.",
  },
  "liquid-solutions": {
    eyebrow: "Solution Preparations",
    blurb: "Supplied pre-mixed as a liquid solution — no reconstitution step required.",
  },
  sprays: {
    eyebrow: "Spray Preparations",
    blurb: "Delivered as a metered spray solution for topical or intranasal research.",
  },
  blends: {
    eyebrow: "Blended Formulations",
    blurb: "A multi-compound blend formulated for combined research protocols.",
  },
  "peptides-compounds": {
    eyebrow: "Lyophilized Compounds",
    blurb: "Standard lyophilized powder, supplied for research reconstitution.",
  },
};

const DEFAULT_STYLE = {
  eyebrow: "Research Compounds",
  blurb: "Another compound from our research catalog.",
};

// Dropper-bottle lines are tagged the same as lyophilized vials upstream but
// are pre-mixed liquid, not powder — override by slug convention so the
// blurb still tells the truth without a new tag taxonomy.
function getPrepStyle(product: { slug: string; tags?: string[] | null }) {
  const isDropper = product.slug.startsWith("drops-") || product.slug.includes("-oral-dropper-");
  if (isDropper) return PREP_STYLE["liquid-solutions"];
  const tag = (product.tags ?? [])[0];
  return (tag && PREP_STYLE[tag]) || DEFAULT_STYLE;
}

export function RelatedResearchCard({ product }: { product: RelatedResearchCardProduct }) {
  const imageUrl = getPrimaryImageUrl(product.product_images);
  const primary = pickPrimaryImage(product.product_images);
  const alt = primary?.alt_text || product.title || "Research chemical";
  const style = getPrepStyle(product);

  return (
    <Link
      href={`/${product.slug}`}
      className="group flex flex-col rounded-[calc(var(--radius)*2)] border border-[hsl(var(--border))] bg-gradient-to-b from-[hsl(var(--primary)/0.06)] to-transparent p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <SmartProductImage src={imageUrl} alt={alt} sizes="(max-width: 768px) 50vw, 25vw" />

      <p className="mt-4 text-[10px] font-black uppercase tracking-wider text-[hsl(var(--primary))]">
        {style.eyebrow}
      </p>
      <h3 className="mt-1 font-bold text-sm sm:text-base leading-snug">{product.title}</h3>
      <p className="mt-1.5 text-xs sm:text-sm text-[var(--muted-foreground)] flex-1">{style.blurb}</p>

      <p className="mt-3 font-bold text-base">
        {formatMoney(product.price_cents, product.currency || "USD")}
      </p>

      <span className="mt-3 inline-flex items-center justify-center rounded-full bg-[hsl(var(--foreground))] py-2.5 text-[11px] sm:text-xs font-bold uppercase tracking-wide text-[hsl(var(--background))] shadow-[0_0_16px_hsl(var(--primary)/0.35)] transition-shadow group-hover:shadow-[0_0_24px_hsl(var(--primary)/0.55)]">
        View Product
      </span>
    </Link>
  );
}
