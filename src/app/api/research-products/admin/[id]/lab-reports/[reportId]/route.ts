// app/api/research-products/admin/[id]/lab-reports/[reportId]/route.ts
//
// Hardened multi-batch COA update & delete handler.
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string; reportId: string }> };

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

const HEADER_FIELDS = [
  "variant_id",
  "batch_id",
  "published_status",
  "review_notes",
  "reviewed_at",
  "reviewed_by",
  "lab_name",
  "lab_logo_url",
  "lab_website",
  "coa_number",
  "access_code",
  "verified",
  "pending",
  "product_label",
  "lot_number",
  "appearance",
  "test_type",
  "date_received",
  "date_confirmed",
  "fentanyl_free",
  "fentanyl_test_method",
  "chromatogram_data",
  "chromatogram_x_label",
  "chromatogram_y_label",
  "chromatogram_sample_ref",
  "notes",
  "methodology",
  "lab_director_name",
  "signed_date",
  "produced_date",
  "pdf_url",
  "paper_image_url",
  "purity_pct",
  "verification_url",
  "sha256_checksum",
  "raw_telemetry",
  "position",
] as const;

// GET /api/research-products/admin/[id]/lab-reports/[reportId]
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id, reportId } = await params;

  const { data, error } = await admin
    .from("research_lab_reports")
    .select(SELECT)
    .eq("id", reportId)
    .eq("product_id", id)
    .single();

  if (error) return jsonError(404, "LAB_REPORT_NOT_FOUND", error.message, error);

  return NextResponse.json({ ok: true, data: normalizeReport(data) });
}

// PATCH /api/research-products/admin/[id]/lab-reports/[reportId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id, reportId } = await params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const patch: Record<string, any> = {};
  for (const key of HEADER_FIELDS) {
    if (key in body) patch[key] = body[key];
  }

  // 1. Batch sync
  const isCurrentShipping = body.is_current_shipping !== undefined ? Boolean(body.is_current_shipping) : undefined;
  const batchNumber = (body.batch_number || body.lot_number || "").toString().trim();

  if (body.batch_id) {
    patch.batch_id = body.batch_id;
    if (isCurrentShipping) {
      await admin.from("research_batches").update({ is_current_shipping: false }).eq("product_id", id);
      await admin.from("research_batches").update({ is_current_shipping: true }).eq("id", body.batch_id);
    }
  } else if (batchNumber && !patch.batch_id) {
    const { data: existingBatch } = await admin
      .from("research_batches")
      .select("id, is_current_shipping")
      .eq("product_id", id)
      .eq("batch_number", batchNumber)
      .maybeSingle();

    if (existingBatch) {
      patch.batch_id = existingBatch.id;
      if (isCurrentShipping) {
        await admin.from("research_batches").update({ is_current_shipping: false }).eq("product_id", id);
        await admin.from("research_batches").update({ is_current_shipping: true }).eq("id", existingBatch.id);
      }
    } else {
      if (isCurrentShipping) {
        await admin.from("research_batches").update({ is_current_shipping: false }).eq("product_id", id);
      }
      const { data: newBatch } = await admin
        .from("research_batches")
        .insert({
          product_id: id,
          batch_number: batchNumber,
          manufactured_date: body.produced_date || null,
          expiration_date: body.expiration_date || null,
          status: "active",
          is_current_shipping: !!isCurrentShipping,
        })
        .select("id")
        .single();
      if (newBatch) {
        patch.batch_id = newBatch.id;
      }
    }
  }

  // 2. Published status validation
  if (body.published_status && ["draft", "in_review", "published", "rejected"].includes(body.published_status)) {
    patch.published_status = body.published_status;
    if (body.published_status === "published" && !patch.reviewed_at) {
      patch.reviewed_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await admin
      .from("research_lab_reports")
      .update(patch)
      .eq("id", reportId)
      .eq("product_id", id);
    if (error) return jsonError(500, "LAB_REPORT_UPDATE_FAILED", error.message, error);
  }

  // 3. Document Assets replacement
  if (Array.isArray(body.assets)) {
    await admin.from("research_lab_report_assets").delete().eq("lab_report_id", reportId);
    if (body.assets.length > 0) {
      await admin.from("research_lab_report_assets").insert(
        body.assets.map((a: any, i: number) => ({
          lab_report_id: reportId,
          asset_type: a.asset_type || "original_pdf",
          page_number: typeof a.page_number === "number" ? a.page_number : i + 1,
          file_url: a.file_url,
          storage_path: a.storage_path || `reports/${reportId}/page-${i + 1}`,
          filename: a.filename || (a.file_url?.split("/").pop() || "document.pdf"),
          file_size_bytes: a.file_size_bytes ?? null,
          mime_type: a.mime_type || (a.file_url?.endsWith(".pdf") ? "application/pdf" : "image/png"),
          sha256_checksum: a.sha256_checksum ?? null,
          is_primary: a.is_primary ?? (i === 0),
        }))
      );
    }
  }

  // 4. Instrument Readings replacement
  if (Array.isArray(body.instrument_readings)) {
    await admin.from("research_lab_report_instrument_readings").delete().eq("lab_report_id", reportId);
    if (body.instrument_readings.length > 0) {
      await admin.from("research_lab_report_instrument_readings").insert(
        body.instrument_readings.map((r: any, i: number) => ({
          lab_report_id: reportId,
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
        }))
      );
    }
  }

  // 5. Results, conformity samples, stats replacement
  if (Array.isArray(body.results)) {
    const { error: delErr } = await admin
      .from("research_lab_report_results")
      .delete()
      .eq("lab_report_id", reportId);
    if (delErr) return jsonError(500, "LAB_REPORT_RESULTS_REPLACE_FAILED", delErr.message, delErr);

    if (body.results.length > 0) {
      const { error } = await admin.from("research_lab_report_results").insert(
        body.results.map((r: any, i: number) => ({
          lab_report_id: reportId,
          section: r.section,
          analyte: r.analyte,
          limit_spec: r.limit_spec ?? null,
          result: r.result ?? null,
          unit: r.unit ?? null,
          status: r.status ?? null,
          position: typeof r.position === "number" ? r.position : i,
        }))
      );
      if (error) return jsonError(500, "LAB_REPORT_RESULTS_REPLACE_FAILED", error.message, error);
    }
  }

  if (Array.isArray(body.conformity_samples)) {
    const { error: delErr } = await admin
      .from("research_lab_report_conformity_samples")
      .delete()
      .eq("lab_report_id", reportId);
    if (delErr) return jsonError(500, "LAB_REPORT_CONFORMITY_REPLACE_FAILED", delErr.message, delErr);

    if (body.conformity_samples.length > 0) {
      const { error } = await admin.from("research_lab_report_conformity_samples").insert(
        body.conformity_samples.map((s: any, i: number) => ({
          lab_report_id: reportId,
          sample_label: s.sample_label,
          purity_pct: s.purity_pct ?? null,
          net_content_mg: s.net_content_mg ?? null,
          identification: s.identification ?? null,
          result: s.result ?? null,
          is_representative: !!s.is_representative,
          position: typeof s.position === "number" ? s.position : i,
        }))
      );
      if (error) return jsonError(500, "LAB_REPORT_CONFORMITY_REPLACE_FAILED", error.message, error);
    }
  }

  if (Array.isArray(body.stats)) {
    const { error: delErr } = await admin
      .from("research_lab_report_stats")
      .delete()
      .eq("lab_report_id", reportId);
    if (delErr) return jsonError(500, "LAB_REPORT_STATS_REPLACE_FAILED", delErr.message, delErr);

    if (body.stats.length > 0) {
      const { error } = await admin.from("research_lab_report_stats").insert(
        body.stats.map((s: any, i: number) => ({
          lab_report_id: reportId,
          metric_name: s.metric_name,
          mean_value: s.mean_value ?? null,
          std_dev: s.std_dev ?? null,
          unit: s.unit ?? null,
          position: typeof s.position === "number" ? s.position : i,
        }))
      );
      if (error) return jsonError(500, "LAB_REPORT_STATS_REPLACE_FAILED", error.message, error);
    }
  }

  const { data: full, error: fullErr } = await admin
    .from("research_lab_reports")
    .select(SELECT)
    .eq("id", reportId)
    .single();

  if (fullErr) return jsonError(500, "LAB_REPORT_REFETCH_FAILED", fullErr.message, fullErr);

  return NextResponse.json({ ok: true, data: normalizeReport(full) });
}

// DELETE /api/research-products/admin/[id]/lab-reports/[reportId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id, reportId } = await params;

  const { error } = await admin
    .from("research_lab_reports")
    .delete()
    .eq("id", reportId)
    .eq("product_id", id);

  if (error) return jsonError(500, "LAB_REPORT_DELETE_FAILED", error.message, error);

  return NextResponse.json({ ok: true });
}
