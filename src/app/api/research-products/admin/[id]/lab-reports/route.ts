// app/api/research-products/admin/[id]/lab-reports/route.ts
//
// COA ("Certificate of Analysis") data for a research chemical product.
// Multi-batch architecture: supports physical batches (research_batches),
// multi-page immutable assets (research_lab_report_assets), and structured
// detector instrument readings (research_lab_report_instrument_readings).
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  return requireAdminClient(supabase);
}

const SELECT = `
  *,
  research_batches ( id, batch_number, status, is_current_shipping, manufactured_date, expiration_date ),
  research_lab_report_assets ( id, asset_type, page_number, file_url, storage_path, filename, file_size_bytes, mime_type, sha256_checksum, is_primary ),
  research_lab_report_instrument_readings ( id, reading_type, peak_number, retention_time_min, area, height, area_pct, chemical_species, signal_to_noise, theoretical_mz, observed_mz, mass_error_ppm, relative_abundance_pct, ion_adduct, instrument_parameters, position ),
  research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
  research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
  research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
`;

function normalizeReport(r: any) {
  const sortByPos = (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0);
  const sortByPage = (a: any, b: any) => (a.page_number ?? 0) - (b.page_number ?? 0);
  const sortByPeak = (a: any, b: any) => (a.peak_number ?? 0) - (b.peak_number ?? 0);
  return {
    ...r,
    batch: r.research_batches ?? null,
    assets: (r.research_lab_report_assets ?? []).slice().sort(sortByPage),
    instrument_readings: (r.research_lab_report_instrument_readings ?? []).slice().sort(sortByPeak),
    results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
    conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    stats: (r.research_lab_report_stats ?? []).slice().sort(sortByPos),
    research_batches: undefined,
    research_lab_report_assets: undefined,
    research_lab_report_instrument_readings: undefined,
    research_lab_report_results: undefined,
    research_lab_report_conformity_samples: undefined,
    research_lab_report_stats: undefined,
  };
}

// GET /api/research-products/admin/[id]/lab-reports
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id } = await params;
  const variantId = req.nextUrl.searchParams.get("variant_id");
  const batchId = req.nextUrl.searchParams.get("batch_id");

  let query = admin
    .from("research_lab_reports")
    .select(SELECT)
    .eq("product_id", id)
    .order("position", { ascending: true })
    .order("date_confirmed", { ascending: false });

  if (variantId) query = query.eq("variant_id", variantId);
  if (batchId) query = query.eq("batch_id", batchId);

  const { data, error } = await query;
  if (error) return jsonError(500, "LAB_REPORTS_FETCH_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data: (data ?? []).map(normalizeReport) });
}

// POST /api/research-products/admin/[id]/lab-reports
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id } = await params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  if (!body?.lab_name || typeof body.lab_name !== "string") {
    return jsonError(400, "INVALID_INPUT", "lab_name is required");
  }

  // 1. Batch resolution & synchronization
  let batchId = body.batch_id ?? null;
  const batchNumber = (body.batch_number || body.lot_number || body.coa_number || "").toString().trim();
  const isCurrentShipping = Boolean(body.is_current_shipping);

  if (!batchId && batchNumber) {
    const { data: existingBatch } = await admin
      .from("research_batches")
      .select("id, is_current_shipping")
      .eq("product_id", id)
      .eq("batch_number", batchNumber)
      .maybeSingle();

    if (existingBatch) {
      batchId = existingBatch.id;
      if (isCurrentShipping && !existingBatch.is_current_shipping) {
        await admin
          .from("research_batches")
          .update({ is_current_shipping: false })
          .eq("product_id", id);
        await admin
          .from("research_batches")
          .update({ is_current_shipping: true })
          .eq("id", batchId);
      }
    } else {
      if (isCurrentShipping) {
        await admin
          .from("research_batches")
          .update({ is_current_shipping: false })
          .eq("product_id", id);
      }
      const { data: newBatch, error: batchErr } = await admin
        .from("research_batches")
        .insert({
          product_id: id,
          batch_number: batchNumber,
          manufactured_date: body.produced_date || null,
          expiration_date: body.expiration_date || null,
          status: "active",
          is_current_shipping: isCurrentShipping,
        })
        .select("id")
        .single();

      if (!batchErr && newBatch) {
        batchId = newBatch.id;
      }
    }
  } else if (batchId && isCurrentShipping) {
    await admin
      .from("research_batches")
      .update({ is_current_shipping: false })
      .eq("product_id", id);
    await admin
      .from("research_batches")
      .update({ is_current_shipping: true })
      .eq("id", batchId);
  }

  // 2. Published status
  const publishedStatus = ["draft", "in_review", "published", "rejected"].includes(body.published_status)
    ? body.published_status
    : body.verified !== false && !body.pending
    ? "published"
    : "draft";

  const header = {
    product_id: id,
    variant_id: body.variant_id ?? null,
    batch_id: batchId,
    published_status: publishedStatus,
    review_notes: body.review_notes ?? null,
    reviewed_at: body.reviewed_at ?? (publishedStatus === "published" ? new Date().toISOString() : null),
    reviewed_by: body.reviewed_by ?? null,
    lab_name: body.lab_name,
    lab_logo_url: body.lab_logo_url ?? null,
    lab_website: body.lab_website ?? null,
    coa_number: body.coa_number ?? null,
    access_code: body.access_code ?? null,
    verified: body.verified ?? true,
    pending: body.pending ?? false,
    product_label: body.product_label ?? null,
    lot_number: body.lot_number ?? batchNumber ?? null,
    appearance: body.appearance ?? null,
    test_type: body.test_type ?? null,
    date_received: body.date_received ?? null,
    date_confirmed: body.date_confirmed ?? null,
    fentanyl_free: body.fentanyl_free ?? null,
    fentanyl_test_method: body.fentanyl_test_method ?? null,
    chromatogram_data: body.chromatogram_data ?? null,
    chromatogram_x_label: body.chromatogram_x_label ?? null,
    chromatogram_y_label: body.chromatogram_y_label ?? null,
    chromatogram_sample_ref: body.chromatogram_sample_ref ?? null,
    notes: body.notes ?? null,
    methodology: body.methodology ?? null,
    lab_director_name: body.lab_director_name ?? null,
    signed_date: body.signed_date ?? null,
    produced_date: body.produced_date ?? null,
    pdf_url: body.pdf_url ?? null,
    paper_image_url: body.paper_image_url ?? null,
    purity_pct: typeof body.purity_pct === "number" ? body.purity_pct : (body.purity_pct ? parseFloat(body.purity_pct) : null),
    verification_url: body.verification_url ?? null,
    sha256_checksum: body.sha256_checksum ?? null,
    raw_telemetry: body.raw_telemetry ?? {},
    position: typeof body.position === "number" ? body.position : 0,
  };

  const { data: report, error: reportErr } = await admin
    .from("research_lab_reports")
    .insert(header)
    .select("*")
    .single();

  if (reportErr) return jsonError(500, "LAB_REPORT_CREATE_FAILED", reportErr.message, reportErr);

  // 3. Multi-page immutable document assets
  let assetsToInsert: any[] = [];
  if (Array.isArray(body.assets) && body.assets.length > 0) {
    assetsToInsert = body.assets.map((a: any, i: number) => ({
      lab_report_id: report.id,
      asset_type: a.asset_type || "original_pdf",
      page_number: typeof a.page_number === "number" ? a.page_number : i + 1,
      file_url: a.file_url,
      storage_path: a.storage_path || `reports/${report.id}/page-${i + 1}`,
      filename: a.filename || (a.file_url?.split("/").pop() || "document.pdf"),
      file_size_bytes: a.file_size_bytes ?? null,
      mime_type: a.mime_type || (a.file_url?.endsWith(".pdf") ? "application/pdf" : "image/png"),
      sha256_checksum: a.sha256_checksum ?? null,
      is_primary: a.is_primary ?? (i === 0),
    }));
  } else {
    if (header.pdf_url) {
      assetsToInsert.push({
        lab_report_id: report.id,
        asset_type: "original_pdf",
        page_number: 1,
        file_url: header.pdf_url,
        storage_path: `reports/${report.id}/original_pdf`,
        filename: header.pdf_url.split("/").pop() || "certificate.pdf",
        mime_type: "application/pdf",
        sha256_checksum: header.sha256_checksum,
        is_primary: true,
      });
    }
    if (header.paper_image_url && header.paper_image_url !== header.pdf_url) {
      assetsToInsert.push({
        lab_report_id: report.id,
        asset_type: "page_scan",
        page_number: 1,
        file_url: header.paper_image_url,
        storage_path: `reports/${report.id}/page_scan`,
        filename: header.paper_image_url.split("/").pop() || "scan.png",
        mime_type: header.paper_image_url.endsWith(".webp") ? "image/webp" : "image/png",
        sha256_checksum: null,
        is_primary: !header.pdf_url,
      });
    }
  }

  if (assetsToInsert.length > 0) {
    const { error: assetErr } = await admin.from("research_lab_report_assets").insert(assetsToInsert);
    if (assetErr) console.warn("[lab-reports/route] Warning inserting assets:", assetErr.message);
  }

  // 4. Structured instrument readings (HPLC peaks & mass spec ions)
  let readingsToInsert: any[] = [];
  if (Array.isArray(body.instrument_readings) && body.instrument_readings.length > 0) {
    readingsToInsert = body.instrument_readings.map((r: any, i: number) => ({
      lab_report_id: report.id,
      reading_type: r.reading_type || "hplc_peak",
      peak_number: r.peak_number ?? i + 1,
      retention_time_min: r.retention_time_min ?? null,
      area: r.area ?? null,
      height: r.height ?? null,
      area_pct: r.area_pct ?? null,
      chemical_species: r.chemical_species ?? null,
      signal_to_noise: r.signal_to_noise ?? null,
      theoretical_mz: r.theoretical_mz ?? null,
      observed_mz: r.observed_mz ?? null,
      mass_error_ppm: r.mass_error_ppm ?? null,
      relative_abundance_pct: r.relative_abundance_pct ?? null,
      ion_adduct: r.ion_adduct ?? null,
      instrument_parameters: r.instrument_parameters ?? {},
      position: typeof r.position === "number" ? r.position : i,
    }));
  } else if (body.raw_telemetry?.readings && Array.isArray(body.raw_telemetry.readings)) {
    readingsToInsert = body.raw_telemetry.readings.map((r: any, i: number) => ({
      lab_report_id: report.id,
      reading_type: "hplc_peak",
      peak_number: r.peakNo ?? i + 1,
      retention_time_min: r.retentionMin ?? r.retention_time_min ?? null,
      area: r.areaMavs ?? r.area ?? null,
      height: r.heightMav ?? r.height ?? null,
      area_pct: r.areaPercent ?? r.area_pct ?? null,
      chemical_species: r.identification ?? r.chemical_species ?? null,
      signal_to_noise: r.s2nRatio ?? r.signal_to_noise ?? null,
      instrument_parameters: body.raw_telemetry.systemModel ? {
        systemModel: body.raw_telemetry.systemModel,
        columnSpec: body.raw_telemetry.columnSpec,
        flowRate: body.raw_telemetry.flowRate,
      } : {},
      position: i,
    }));
  }

  if (readingsToInsert.length > 0) {
    const { error: readErr } = await admin.from("research_lab_report_instrument_readings").insert(readingsToInsert);
    if (readErr) console.warn("[lab-reports/route] Warning inserting instrument readings:", readErr.message);
  }

  // 5. Results, conformity samples, stats
  const results = Array.isArray(body.results) ? body.results : [];
  const conformitySamples = Array.isArray(body.conformity_samples) ? body.conformity_samples : [];
  const stats = Array.isArray(body.stats) ? body.stats : [];

  if (results.length > 0) {
    const { error } = await admin.from("research_lab_report_results").insert(
      results.map((r: any, i: number) => ({
        lab_report_id: report.id,
        section: r.section,
        analyte: r.analyte,
        limit_spec: r.limit_spec ?? null,
        result: r.result ?? null,
        unit: r.unit ?? null,
        status: r.status ?? null,
        position: typeof r.position === "number" ? r.position : i,
      }))
    );
    if (error) return jsonError(500, "LAB_REPORT_RESULTS_CREATE_FAILED", error.message, error);
  }

  if (conformitySamples.length > 0) {
    const { error } = await admin.from("research_lab_report_conformity_samples").insert(
      conformitySamples.map((s: any, i: number) => ({
        lab_report_id: report.id,
        sample_label: s.sample_label,
        purity_pct: s.purity_pct ?? null,
        net_content_mg: s.net_content_mg ?? null,
        identification: s.identification ?? null,
        result: s.result ?? null,
        is_representative: !!s.is_representative,
        position: typeof s.position === "number" ? s.position : i,
      }))
    );
    if (error) return jsonError(500, "LAB_REPORT_CONFORMITY_CREATE_FAILED", error.message, error);
  }

  if (stats.length > 0) {
    const { error } = await admin.from("research_lab_report_stats").insert(
      stats.map((s: any, i: number) => ({
        lab_report_id: report.id,
        metric_name: s.metric_name,
        mean_value: s.mean_value ?? null,
        std_dev: s.std_dev ?? null,
        unit: s.unit ?? null,
        position: typeof s.position === "number" ? s.position : i,
      }))
    );
    if (error) return jsonError(500, "LAB_REPORT_STATS_CREATE_FAILED", error.message, error);
  }

  const { data: full, error: fullErr } = await admin
    .from("research_lab_reports")
    .select(SELECT)
    .eq("id", report.id)
    .single();

  if (fullErr) return jsonError(500, "LAB_REPORT_REFETCH_FAILED", fullErr.message, fullErr);

  return NextResponse.json({ ok: true, data: normalizeReport(full) });
}
