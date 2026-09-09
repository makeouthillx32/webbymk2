// src/lib/research/queries.ts
//
// Shared Supabase query helpers for the Labs research-chemical storefront.
// Pulled out of app/research/**/page.tsx so the same logic can be reused by
// the root-level [categorySlug] resolver (labs.unenter.live/<product-or-category>)
// without duplicating these large embedded selects.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getResearchProductMoleculeXml } from "@/data/research-product-molecules";
import { parseDrawioMolecule } from "@/components/research/molecule-drawio";

const sortByPos = (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0);

export interface ResearchProductSection {
  id: string;
  product_id: string | null;
  category_id: string | null;
  form_factor: string | null;
  section_key: string;
  section_type: string;
  title: string | null;
  eyebrow: string | null;
  html_content: string | null;
  content_json: Record<string, any> | null;
  position: number;
  is_enabled: boolean;
  status: string;
  source_level: "product_override" | "form_template" | "category_template" | "labs_default";
}

export async function getResearchProductSections(
  supabase: SupabaseClient,
  productId: string,
  categoryId?: string | null,
  formFactor?: string | null,
): Promise<ResearchProductSection[]> {
  const { data, error } = await supabase.rpc("get_product_sections", {
    p_product_id: productId,
    p_category_id: categoryId ?? null,
    p_form_factor: formFactor ?? null,
  });

  if (error) {
    console.error("[research] get_product_sections error:", error.message);
    return [];
  }

  return (data ?? []) as ResearchProductSection[];
}

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
      form_factor,
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
      research_batches (
        id,
        batch_number,
        status,
        is_current_shipping,
        manufactured_date,
        expiration_date,
        remaining_quantity,
        created_at
      ),
      research_lab_reports (
        *,
        research_batches ( id, batch_number, status, is_current_shipping, manufactured_date, expiration_date ),
        research_lab_report_assets ( id, asset_type, page_number, file_url, storage_path, filename, file_size_bytes, mime_type, sha256_checksum, is_primary ),
        research_lab_report_instrument_readings ( id, reading_type, peak_number, retention_time_min, area, height, area_pct, chemical_species, signal_to_noise, theoretical_mz, observed_mz, mass_error_ppm, relative_abundance_pct, ion_adduct, instrument_parameters ),
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
    form_factor: (product as any).form_factor ?? null,
    molecule_drawing: parseDrawioMolecule(getResearchProductMoleculeXml(product.slug)),
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
    batches: ((product as any).research_batches || [])
      .slice()
      .sort((a: any, b: any) => {
        if (a.is_current_shipping && !b.is_current_shipping) return -1;
        if (!a.is_current_shipping && b.is_current_shipping) return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }),
    lab_reports: ((product as any).research_lab_reports || [])
      .filter((r: any) => r.published_status === "published" || (r.published_status == null && r.verified !== false && !r.pending))
      .map((r: any) => ({
        ...r,
        batch: r.research_batches ?? null,
        assets: (r.research_lab_report_assets ?? []).slice().sort((a: any, b: any) => (a.page_number ?? 0) - (b.page_number ?? 0)),
        instrument_readings: (r.research_lab_report_instrument_readings ?? []).slice().sort((a: any, b: any) => (a.peak_number ?? 0) - (b.peak_number ?? 0)),
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
      research_batches (
        id,
        batch_number,
        manufactured_date,
        expiration_date,
        status,
        is_current_shipping
      ),
      research_lab_report_assets (
        id,
        asset_type,
        page_number,
        file_url,
        storage_path,
        filename,
        file_size_bytes,
        mime_type,
        sha256_checksum,
        is_primary
      ),
      research_lab_report_instrument_readings (
        id,
        reading_type,
        peak_number,
        retention_time_min,
        area,
        height,
        area_pct,
        chemical_species,
        signal_to_noise,
        theoretical_mz,
        observed_mz,
        mass_error_ppm,
        relative_abundance_pct,
        ion_adduct,
        instrument_parameters,
        position
      ),
      research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
      research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
      research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position ),
      research_products ( id, title, slug, status )
    `,
    )
    .eq("access_code", code)
    .eq("published_status", "published")
    .maybeSingle();

  if (error || !data) return null;

  const product = (data as any).research_products;
  if (!product || product.status !== "active") return null;

  return {
    ...data,
    results: ((data as any).research_lab_report_results ?? []).slice().sort(sortByPos),
    conformity_samples: ((data as any).research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    stats: ((data as any).research_lab_report_stats ?? []).slice().sort(sortByPos),
    assets: ((data as any).research_lab_report_assets ?? []).slice().sort(sortByPos),
    instrument_readings: ((data as any).research_lab_report_instrument_readings ?? []).slice().sort(sortByPos),
    batch: (data as any).research_batches ?? null,
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
      research_batches (
        id,
        batch_number,
        manufactured_date,
        expiration_date,
        status,
        is_current_shipping
      ),
      research_lab_report_assets (
        id,
        asset_type,
        page_number,
        file_url,
        storage_path,
        filename,
        file_size_bytes,
        mime_type,
        sha256_checksum,
        is_primary
      ),
      research_lab_report_instrument_readings (
        id,
        reading_type,
        peak_number,
        retention_time_min,
        area,
        height,
        area_pct,
        chemical_species,
        signal_to_noise,
        theoretical_mz,
        observed_mz,
        mass_error_ppm,
        relative_abundance_pct,
        ion_adduct,
        instrument_parameters,
        position
      ),
      research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
      research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
      research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
    `,
    )
    .eq("product_id", product.id)
    .eq("published_status", "published")
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
      assets: (r.research_lab_report_assets ?? []).slice().sort(sortByPos),
      instrument_readings: (r.research_lab_report_instrument_readings ?? []).slice().sort(sortByPos),
      batch: r.research_batches ?? null,
    })),
  };
}

// Related products for the detail page — other active products sharing at
// least one category with the current product, newest first, current
// product excluded. If category matches are insufficient (< limit), falls
// back to other active catalog products so the related shelf is never empty.
// Shaped identically to getResearchCatalog's product list so the result can
// feed straight into <ResearchProductCard> or <RelatedResearchCard>.
export async function getRelatedResearchProducts(
  supabase: SupabaseClient,
  productId: string,
  categoryIds: string[] = [],
  limit = 4,
) {
  let candidateIds: string[] = [];
  const validCategoryIds = (Array.isArray(categoryIds) ? categoryIds : [categoryIds]).filter(Boolean);

  if (validCategoryIds.length > 0) {
    const { data: links } = await supabase
      .from("research_product_categories")
      .select("product_id")
      .in("category_id", validCategoryIds)
      .neq("product_id", productId);

    if (links && links.length > 0) {
      const allIds = links.map((l: any) => l.product_id as string);
      candidateIds = allIds.filter((id: string, idx: number, arr: string[]) => arr.indexOf(id) === idx);
    }
  }

  let products: any[] = [];

  if (candidateIds.length > 0) {
    const { data } = await supabase
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

    if (data) {
      products = data;
    }
  }

  // Catalog fallback if category matches are insufficient (< limit)
  if (products.length < limit) {
    const existingIds = new Set<string>();
    existingIds.add(productId);
    for (const p of products) existingIds.add(p.id);
    const needed = limit - products.length;

    const { data: fallback } = await supabase
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
      .neq("id", productId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(needed + existingIds.size);

    if (fallback) {
      for (const p of fallback) {
        if (!existingIds.has(p.id)) {
          products.push(p);
          existingIds.add(p.id);
          if (products.length >= limit) break;
        }
      }
    }
  }

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
// grouped by product. Powers /verify and /coa, the searchable "find your batch"
// index page (product dropdown + batch/lot search), distinct from
// /verify/product/<slug> which only covers one compound at a time.
export async function getLabResultsLibrary(supabase: SupabaseClient) {
  const { data: reports, error } = await supabase
    .from("research_lab_reports")
    .select(
      `
      id,
      batch_id,
      published_status,
      access_code,
      lot_number,
      coa_number,
      lab_name,
      purity_pct,
      verified,
      pending,
      product_label,
      test_type,
      date_confirmed,
      pdf_url,
      paper_image_url,
      verification_url,
      sha256_checksum,
      raw_telemetry,
      methodology,
      notes,
      appearance,
      research_batches (
        id,
        batch_number,
        manufactured_date,
        expiration_date,
        status,
        is_current_shipping
      ),
      research_lab_report_assets (
        id,
        asset_type,
        page_number,
        file_url,
        storage_path,
        filename,
        file_size_bytes,
        mime_type,
        sha256_checksum,
        is_primary
      ),
      research_lab_report_instrument_readings (
        id,
        reading_type,
        peak_number,
        retention_time_min,
        area,
        height,
        area_pct,
        chemical_species,
        signal_to_noise,
        theoretical_mz,
        observed_mz,
        mass_error_ppm,
        relative_abundance_pct,
        ion_adduct,
        instrument_parameters,
        position
      ),
      research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
      research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
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
    .eq("published_status", "published")
    .order("date_confirmed", { ascending: false, nullsFirst: false });

  if (error || !reports) return [];

  const byProduct = new Map<
    string,
    {
      id: string;
      slug: string;
      title: string;
      dosage_label: string | null;
      reports: any[];
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
      batch_id: r.batch_id,
      published_status: r.published_status,
      access_code: r.access_code,
      lot_number: r.lot_number,
      coa_number: r.coa_number,
      lab_name: r.lab_name,
      purity_pct: r.purity_pct,
      verified: r.verified,
      pending: r.pending,
      product_label: r.product_label,
      test_type: r.test_type,
      date_confirmed: r.date_confirmed,
      pdf_url: r.pdf_url,
      paper_image_url: r.paper_image_url,
      verification_url: r.verification_url,
      sha256_checksum: r.sha256_checksum,
      raw_telemetry: r.raw_telemetry,
      methodology: r.methodology,
      notes: r.notes,
      appearance: r.appearance,
      research_batches: r.research_batches,
      research_lab_report_assets: r.research_lab_report_assets,
      research_lab_report_instrument_readings: r.research_lab_report_instrument_readings,
      results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
      conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    });
  }

  return Array.from(byProduct.values()).sort((a, b) => a.title.localeCompare(b.title));
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
