import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

type Params = { params: { slug: string } };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/products/[slug]
 * Public product detail (active products only)
 *
 * Optional query:
 *  - include=inventory  -> includes inventory per variant
 */
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const slug = params.slug;
  if (!slug) return jsonError(400, "INVALID_SLUG", "Missing slug");

  const { searchParams } = new URL(req.url);
  const includeInventory = searchParams.get("include") === "inventory";

  const variantsSelect = includeInventory
    ? `
      id,
      product_id,
      title,
      sku,
      price_cents,
      compare_at_price_cents,
      position,
      is_active,
      track_inventory,
      allow_backorder,
      inventory_qty,
      currency,
      weight_grams,
      options,
      option_values,
      options_text,
      created_at,
      updated_at,
      inventory (
        variant_id,
        quantity,
        track_inventory,
        allow_backorder,
        updated_at
      )
    `
    : `
      id,
      product_id,
      title,
      sku,
      price_cents,
      compare_at_price_cents,
      position,
      is_active,
      track_inventory,
      allow_backorder,
      inventory_qty,
      currency,
      weight_grams,
      options,
      option_values,
      options_text,
      created_at,
      updated_at
    `;

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      slug,
      title,
      description,
      price_cents,
      compare_at_price_cents,
      currency,
      badge,
      brand,
      featured,
      is_featured,
      status,
      tags,
      search_text,
      created_at,
      updated_at,
      created_by,

      product_images (
        id,
        bucket_name,
        object_path,
        alt_text,
        sort_order,
        position,
        is_primary,
        is_public,
        blurhash,
        width,
        height,
        mime_type,
        size_bytes,
        created_at
      ),

      product_variants (${variantsSelect}),

      product_categories (
        categories (
          id,
          slug,
          name,
          parent_id
        )
      )
    `
    )
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(
      status,
      status === 404 ? "NOT_FOUND" : "PRODUCT_FETCH_FAILED",
      status === 404 ? "Product not found" : error.message ?? "Failed to fetch product"
    );
  }

  const categories =
    data?.product_categories?.map((pc: any) => pc.categories).filter(Boolean) ?? [];

  const images = (data?.product_images ?? []).slice().sort((a: any, b: any) => {
    const sa = typeof a.sort_order === "number" ? a.sort_order : 0;
    const sb = typeof b.sort_order === "number" ? b.sort_order : 0;
    if (sa !== sb) return sa - sb;

    const pa = typeof a.position === "number" ? a.position : 0;
    const pb = typeof b.position === "number" ? b.position : 0;
    if (pa !== pb) return pa - pb;

    const ca = a.created_at ? Date.parse(a.created_at) : 0;
    const cb = b.created_at ? Date.parse(b.created_at) : 0;
    return ca - cb;
  });

  const variants = (data?.product_variants ?? [])
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)))
    .map((v: any) => {
      if (!includeInventory) return v;

      // Provide a single, easy field for storefront usage
      const inventory_quantity =
        typeof v?.inventory?.quantity === "number"
          ? v.inventory.quantity
          : typeof v?.inventory_qty === "number"
            ? v.inventory_qty
            : null;

      return { ...v, inventory_quantity };
    });

  const primary_image =
    images.find((img: any) => img?.is_primary) ?? (images.length > 0 ? images[0] : null);

  return NextResponse.json({
    ok: true,
    data: {
      ...data,
      product_images: images,
      product_variants: variants,
      categories,
      primary_image,
    },
  });
}