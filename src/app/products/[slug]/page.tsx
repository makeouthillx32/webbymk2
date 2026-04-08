// app/products/[slug]/page.tsx
//
// ✅ VERIFIED against descowgrl Supabase (efglhzzageijqhfwvsub)
//    - product_images.bucket_name = "product-images" (confirmed in live data)
//    - product_images.object_path = "products/{id}/{n}.webp"
//    - is_primary, sort_order, position, is_public all exist on product_images
//    - products has is_featured (not "featured")

import { createServerClient, createServiceClient } from "@/utils/supabase/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ProductDetailClient from "./_components/ProductDetailClient";

// ─── Constants ────────────────────────────────────────────────────────────────

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://desertcowgirl.co";

// ─── Static params ────────────────────────────────────────────────────────────

export async function generateStaticParams() {
  const supabase = createServiceClient();
  const { data: products } = await supabase
    .from("products")
    .select("slug")
    .eq("status", "active");

  return products?.map((p) => ({ slug: p.slug })) ?? [];
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("title, description, updated_at")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!product) {
    return { title: "Product Not Found | Desert Cowgirl Co." };
  }

  const title = `${product.title} | Desert Cowgirl Co.`;
  const ogTitle = product.title;
  const description =
    product.description ??
    `Shop ${product.title} at Desert Cowgirl — western-inspired boutique fashion.`;
  const url = `${SITE_URL}/products/${slug}`;
  const ogImageVersion = encodeURIComponent(product.updated_at ?? product.title);
  const ogImageUrl = `${SITE_URL}/products/${slug}/opengraph-image?v=${ogImageVersion}`;

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      url,
      siteName: "Desert Cowgirl",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: product.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImageUrl],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: product, error } = await supabase
    .from("products")
    .select(`
      id,
      title,
      slug,
      description,
      status,
      brand,
      is_featured,
      badge,
      price_cents,
      compare_at_price_cents,
      currency,
      material,
      made_in,
      created_at,
      updated_at,
      product_images (
        id,
        bucket_name,
        object_path,
        alt_text,
        sort_order,
        position,
        is_primary,
        is_public
      ),
      product_variants (
        id,
        sku,
        title,
        options,
        price_cents,
        compare_at_price_cents,
        inventory_qty,
        track_inventory,
        allow_backorder,
        weight_grams,
        position,
        is_active
      ),
      product_categories (
        categories (
          id,
          name,
          slug
        )
      )
    `)
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    notFound();
  }

  if (!product) {
    notFound();
  }

  const formattedProduct = {
    ...product,
    images: (product.product_images || []).sort(
      (a: any, b: any) =>
        (a.sort_order ?? a.position ?? 0) - (b.sort_order ?? b.position ?? 0)
    ),
    variants: (product.product_variants || [])
      .filter((v: any) => v.is_active !== false)
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((v: any) => ({
        id: v.id,
        sku: v.sku,
        title: v.title,
        options: v.options || {},
        price_cents: v.price_cents,
        compare_at_price_cents: v.compare_at_price_cents,
        inventory_quantity: v.inventory_qty || 0,
        track_inventory: v.track_inventory ?? true,
        allow_backorder: v.allow_backorder ?? false,
        weight_grams: v.weight_grams,
        position: v.position,
      })),
    categories: (product.product_categories || [])
      .map((pc: any) => pc.categories)
      .filter(Boolean),
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <ProductDetailClient product={formattedProduct} />
    </div>
  );
}

// Revalidate every hour
export const revalidate = 3600;