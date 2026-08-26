import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

type Params = { params: Promise<{ slug: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/research-products/[slug]
 * Public product detail (active products only)
 *
 * Optional query:
 *  - include=inventory  -> includes inventory per variant
 */
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const { slug } = await params;
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
      research_inventory (
        variant_id,
        quantity,
        track_inventory,
        allow_backorder,
        updated_at
      ),
      research_variant_images (
        variant_id, image_id, position, is_primary, image_type
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
      updated_at,
      research_variant_images (
        variant_id, image_id, position, is_primary, image_type
      )
    `;

  const { data, error } = await supabase
    .from("research_products")
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

      research_product_images (
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

      research_product_variants (${variantsSelect}),

      research_product_categories (
        research_categories (
          id,
          slug,
          name,
          parent_id
        )
      ),

      research_lab_reports (
        *,
        research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
        research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
        research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
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
    (data as any)?.research_product_categories?.map((pc: any) => pc.research_categories).filter(Boolean) ?? [];

  const images = ((data as any)?.research_product_images ?? []).slice().sort((a: any, b: any) => {
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

  const variants = ((data as any)?.research_product_variants ?? [])
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)))
    .map((v: any) => {
      const variantImages = (v.research_variant_images ?? [])
        .slice()
        .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)))
        .map((vi: any) => ({
          image_id: vi.image_id,
          position: vi.position,
          is_primary: vi.is_primary,
          image_type: vi.image_type,
        }));

      const base = { ...v, images: variantImages, research_variant_images: undefined };

      if (!includeInventory) return base;

      // Provide a single, easy field for storefront usage
      const inventory_quantity =
        typeof v?.research_inventory?.quantity === "number"
          ? v.research_inventory.quantity
          : typeof v?.inventory_qty === "number"
            ? v.inventory_qty
            : null;

      return { ...base, inventory_quantity };
    });

  const sortByPos = (a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0));
  const lab_reports = ((data as any)?.research_lab_reports ?? []).map((r: any) => ({
    ...r,
    results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
    conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    stats: (r.research_lab_report_stats ?? []).slice().sort(sortByPos),
    research_lab_report_results: undefined,
    research_lab_report_conformity_samples: undefined,
    research_lab_report_stats: undefined,
  }));

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
      lab_reports,
      research_lab_reports: undefined,
    },
  });
}