// app/api/pos/products/route.ts
//
// GET /api/pos/products
// Admin-only. Fetches all active products and remaps to the POSProduct
// shape the POS components expect. Reuses existing data — no new DB logic.

import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function buildImageUrl(bucketName: string | null, objectPath: string | null): string | null {
  if (!bucketName || !objectPath || !SUPABASE_URL) return null;
  const encoded = objectPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${encoded}`;
}

function pickImageUrl(images: any[]): string | null {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1;
    if (!a.is_primary && b.is_primary) return 1;
    return (a.sort_order ?? a.position ?? 9999) - (b.sort_order ?? b.position ?? 9999);
  });
  const img = sorted[0];
  return buildImageUrl(img?.bucket_name ?? null, img?.object_path ?? null);
}

export async function GET() {
  const supabase = await createServerClient();

  // Fetch active products with everything the POS needs
  const { data, error } = await supabase
    .from("products")
    .select(`
      id, slug, title, price_cents, compare_at_price_cents,
      product_images ( bucket_name, object_path, is_primary, sort_order, position ),
      product_variants (
        id, title, sku, price_cents, compare_at_price_cents,
        position, is_active, track_inventory, allow_backorder,
        inventory_qty, options
      ),
      product_collections ( collections ( id, slug, name ) ),
      product_categories ( categories ( id, slug, name ) )
    `)
    .eq("status", "active")
    .order("title", { ascending: true });

  if (error) return jsonError(500, "FETCH_FAILED", error.message);

  // Remap to POSProduct shape
  const products = (data ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    price_cents: p.price_cents,
    compare_at_price_cents: p.compare_at_price_cents ?? null,
    image_url: pickImageUrl(p.product_images ?? []),
    variants: (p.product_variants ?? [])
      .filter((v: any) => v.is_active !== false)
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
      .map((v: any) => ({
        id: v.id,
        title: v.title ?? "Default",
        sku: v.sku ?? null,
        price_cents: v.price_cents,
        compare_at_price_cents: v.compare_at_price_cents ?? null,
        options: v.options ?? {},
        inventory_qty: v.inventory_qty ?? 0,
        track_inventory: v.track_inventory ?? false,
        allow_backorder: v.allow_backorder ?? false,
      })),
    collections: (p.product_collections ?? [])
      .map((pc: any) => pc.collections)
      .filter(Boolean)
      .map((c: any) => ({ id: c.id, slug: c.slug, title: c.name })),
    categories: (p.product_categories ?? [])
      .map((pc: any) => pc.categories)
      .filter(Boolean)
      .map((c: any) => ({ id: c.id, slug: c.slug, name: c.name })),
  }));

  return NextResponse.json({ ok: true, products });
}
