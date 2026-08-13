// src/lib/research/queries.ts
//
// Shared Supabase query helpers for the Labs research-chemical storefront.
// Pulled out of app/research/**/page.tsx so the same logic can be reused by
// the root-level [categorySlug] resolver (labs.unenter.live/<product-or-category>)
// without duplicating these large embedded selects.

import type { SupabaseClient } from "@supabase/supabase-js";

const sortByPos = (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0);

export async function getResearchProductBySlug(supabase: SupabaseClient, slug: string) {
  const { data: product, error } = await supabase
    .from("research_products")
    .select(
      `
      id,
      title,
      slug,
      description,
      dosage_label,
      status,
      badge,
      is_featured,
      price_cents,
      compare_at_price_cents,
      currency,
      brand,
      tags,
      cas_number,
      purity_percent,
      research_use_only,
      coa_url,
      created_at,
      updated_at,
      research_product_images (
        id,
        bucket_name,
        object_path,
        alt_text,
        sort_order,
        position,
        is_primary,
        is_public
      ),
      research_product_variants (
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
        is_active,
        research_variant_images (
          image_id, position, is_primary, image_type
        )
      ),
      research_product_categories (
        research_categories (
          id,
          name,
          slug
        )
      ),
      research_lab_reports (
        *,
        research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
        research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
        research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
      )
    `,
    )
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !product) return null;

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    description: product.description,
    dosage_label: (product as any).dosage_label ?? null,
    badge: product.badge,
    price_cents: product.price_cents,
    compare_at_price_cents: product.compare_at_price_cents,
    currency: product.currency || "USD",
    brand: (product as any).brand ?? null,
    tags: (product as any).tags ?? [],
    cas_number: (product as any).cas_number ?? null,
    purity_percent: (product as any).purity_percent ?? null,
    research_use_only: (product as any).research_use_only ?? null,
    coa_url: (product as any).coa_url ?? null,
    images: ((product as any).research_product_images || []).slice().sort(
      (a: any, b: any) => (a.sort_order ?? a.position ?? 0) - (b.sort_order ?? b.position ?? 0),
    ),
    variants: ((product as any).research_product_variants || [])
      .filter((v: any) => v.is_active !== false)
      .slice()
      .sort(sortByPos)
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
        images: (v.research_variant_images || [])
          .slice()
          .sort(sortByPos)
          .map((vi: any) => ({
            image_id: vi.image_id,
            position: vi.position,
            is_primary: vi.is_primary,
            image_type: vi.image_type,
          })),
      })),
    categories: ((product as any).research_product_categories || [])
      .map((pc: any) => pc.research_categories)
      .filter(Boolean),
    lab_reports: ((product as any).research_lab_reports || []).map((r: any) => ({
      ...r,
      results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
      conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
      stats: (r.research_lab_report_stats ?? []).slice().sort(sortByPos),
    })),
  };
}

// Standalone COA lookup by access_code — powers /verify/<code>, the page a
// vial-label QR code points at. Independent of product slug so a scan works
// even if the shopper doesn't know (or the label doesn't show) which product
// page it belongs to.
export async function getLabReportByAccessCode(supabase: SupabaseClient, code: string) {
  const { data, error } = await supabase
    .from("research_lab_reports")
    .select(
      `
      *,
      research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
      research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
      research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position ),
      research_products ( id, title, slug, status )
    `,
    )
    .eq("access_code", code)
    .maybeSingle();

  if (error || !data) return null;

  const product = (data as any).research_products;
  if (!product || product.status !== "active") return null;

  return {
    ...data,
    results: ((data as any).research_lab_report_results ?? []).slice().sort(sortByPos),
    conformity_samples: ((data as any).research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    stats: ((data as any).research_lab_report_stats ?? []).slice().sort(sortByPos),
    product: { id: product.id, title: product.title, slug: product.slug },
  };
}

// Full, unfiltered batch/testing history for one product — every COA on
// file across every variant (not just whichever variant happens to be
// selected on the product page). Powers /verify/product/<slug>, the "full
// transparency" library a QR code lands on: scan a vial, see every batch
// ever sent off for that compound, and find your own batch number in the
// list (printed on the vial/receipt).
export async function getLabReportLibraryForProduct(supabase: SupabaseClient, slug: string) {
  const { data: product, error: productError } = await supabase
    .from("research_products")
    .select("id, title, slug, description, status")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (productError || !product) return null;

  const { data: reports, error: reportsError } = await supabase
    .from("research_lab_reports")
    .select(
      `
      *,
      research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
      research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
      research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
    `,
    )
    .eq("product_id", product.id)
    .order("date_confirmed", { ascending: false, nullsFirst: false })
    .order("position", { ascending: true });

  if (reportsError) return null;

  return {
    product: { id: product.id, title: product.title, slug: product.slug, description: product.description },
    reports: (reports ?? []).map((r: any) => ({
      ...r,
      results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
      conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
      stats: (r.research_lab_report_stats ?? []).slice().sort(sortByPos),
    })),
  };
}

// Related products for the detail page — other active products sharing at
// least one category with the current product, newest first, current
// product excluded. Shaped identically to getResearchCatalog's product list
// so the result can feed straight into <ResearchProductCard>.
export async function getRelatedResearchProducts(
  supabase: SupabaseClient,
  productId: string,
  categoryIds: string[],
  limit = 4,
) {
  if (categoryIds.length === 0) return [];

  const { data: links, error: linksError } = await supabase
    .from("research_product_categories")
    .select("product_id")
    .in("category_id", categoryIds)
    .neq("product_id", productId);

  if (linksError) return [];

  const candidateIds = [...new Set((links ?? []).map((l: any) => l.product_id))];
  if (candidateIds.length === 0) return [];

  const { data: products, error } = await supabase
    .from("research_products")
    .select(
      `
      id,
      slug,
      title,
      dosage_label,
      price_cents,
      compare_at_price_cents,
      currency,
      badge,
      tags,
      research_product_images (
        id,
        bucket_name,
        object_path,
        alt_text,
        sort_order,
        position,
        is_primary,
        is_public
      )
    `,
    )
    .in("id", candidateIds)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !products) return [];

  return products.map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    dosage_label: p.dosage_label ?? null,
    price_cents: p.price_cents,
    compare_at_price_cents: p.compare_at_price_cents,
    currency: p.currency || "USD",
    badge: p.badge,
    tags: p.tags ?? [],
    product_images: (p.research_product_images ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? a.position ?? 0) - (b.sort_order ?? b.position ?? 0)),
  }));
}

// Site-wide COA library — every lab report on file, across every product,
// grouped by product. Powers /verify, the searchable "find your batch"
// index page (product dropdown + batch/lot search), distinct from
// /verify/product/<slug> which only covers one compound at a time.
export async function getLabResultsLibrary(supabase: SupabaseClient) {
  const { data: reports, error } = await supabase
    .from("research_lab_reports")
    .select(
      `
      id,
      access_code,
      lot_number,
      coa_number,
      verified,
      pending,
      product_label,
      test_type,
      date_confirmed,
      pdf_url,
      research_products!inner (
        id,
        slug,
        title,
        dosage_label,
        status
      )
    `,
    )
    .eq("research_products.status", "active")
    .order("date_confirmed", { ascending: false, nullsFirst: false });

  if (error || !reports) return [];

  const byProduct = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      dosage_label: string | null;
      reports: {
        id: string;
        access_code: string | null;
        lot_number: string | null;
        coa_number: string | null;
        verified: boolean;
        pending: boolean;
        product_label: string | null;
        test_type: string | null;
        date_confirmed: string | null;
        pdf_url: string | null;
      }[];
    }
  >();

  for (const r of reports as any[]) {
    const product = r.research_products;
    if (!product) continue;
    if (!byProduct.has(product.id)) {
      byProduct.set(product.id, {
        id: product.id,
        slug: product.slug,
        title: product.title,
        dosage_label: product.dosage_label ?? null,
        reports: [],
      });
    }
    byProduct.get(product.id)!.reports.push({
      id: r.id,
      access_code: r.access_code,
      lot_number: r.lot_number,
      coa_number: r.coa_number,
      verified: r.verified,
      pending: r.pending,
      product_label: r.product_label,
      test_type: r.test_type,
      date_confirmed: r.date_confirmed,
      pdf_url: r.pdf_url,
    });
  }

  return [...byProduct.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export async function getResearchCategoryBySlug(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from("research_categories")
    .select("id, slug, name")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data;
}

export async function getResearchCatalog(supabase: SupabaseClient) {
  const [{ data: products, error: productsError }, { data: categories, error: categoriesError }] =
    await Promise.all([
      supabase
        .from("research_products")
        .select(
          `
          id,
          slug,
          title,
          dosage_label,
          price_cents,
          compare_at_price_cents,
          currency,
          badge,
          is_featured,
          created_at,
          research_product_images (
            id,
            bucket_name,
            object_path,
            alt_text,
            sort_order,
            position,
            is_primary,
            is_public
          ),
          research_product_categories (
            research_categories ( slug )
          )
        `
        )
        .eq("status", "active")
        .order("created_at", { ascending: false }),
      supabase
        .from("research_categories")
        .select("id, slug, name, position")
        .order("position", { ascending: true, nullsFirst: false }),
    ]);

  if (productsError) console.error("[research] products fetch error:", productsError.message);
  if (categoriesError) console.error("[research] categories fetch error:", categoriesError.message);

  const formattedProducts = (products ?? []).map((p: any) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    dosage_label: p.dosage_label ?? null,
    price_cents: p.price_cents,
    compare_at_price_cents: p.compare_at_price_cents,
    currency: p.currency || "USD",
    badge: p.badge,
    is_featured: p.is_featured,
    created_at: p.created_at,
    product_images: (p.research_product_images ?? []).slice().sort(
      (a: any, b: any) => (a.sort_order ?? a.position ?? 0) - (b.sort_order ?? b.position ?? 0),
    ),
    category_slugs: (p.research_product_categories ?? [])
      .map((pc: any) => pc.research_categories?.slug)
      .filter(Boolean),
  }));

  return {
    products: formattedProducts,
    categories: (categories ?? []).map((c: any) => ({ id: c.id, slug: c.slug, name: c.name })),
  };
}
