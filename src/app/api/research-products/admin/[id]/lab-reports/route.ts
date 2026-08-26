// app/api/research-products/admin/[id]/lab-reports/route.ts
//
// COA ("Certificate of Analysis") data for a research chemical product.
// Distinct from research_product_images / research_variant_images (photos,
// including scanned lab-report images) — this is *structured* COA data
// (analytes, conformity samples, stats, chromatogram point series) that the
// storefront renders/plots itself.
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
  research_lab_report_results ( id, section, analyte, limit_spec, result, unit, status, position ),
  research_lab_report_conformity_samples ( id, sample_label, purity_pct, net_content_mg, identification, result, is_representative, position ),
  research_lab_report_stats ( id, metric_name, mean_value, std_dev, unit, position )
`;

function normalizeReport(r: any) {
  const sortByPos = (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0);
  return {
    ...r,
    results: (r.research_lab_report_results ?? []).slice().sort(sortByPos),
    conformity_samples: (r.research_lab_report_conformity_samples ?? []).slice().sort(sortByPos),
    stats: (r.research_lab_report_stats ?? []).slice().sort(sortByPos),
    research_lab_report_results: undefined,
    research_lab_report_conformity_samples: undefined,
    research_lab_report_stats: undefined,
  };
}

// GET /api/research-products/admin/[id]/lab-reports
// List every COA for this product (optionally filter by ?variant_id=).
export async function GET(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  const admin = createAdminClient();

  const { id } = await params;
  const variantId = req.nextUrl.searchParams.get("variant_id");

  let query = admin
    .from("research_lab_reports")
    .select(SELECT)
    .eq("product_id", id)
    .order("position", { ascending: true })
    .order("date_confirmed", { ascending: false });

  if (variantId) query = query.eq("variant_id", variantId);

  const { data, error } = await query;
  if (error) return jsonError(500, "LAB_REPORTS_FETCH_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data: (data ?? []).map(normalizeReport) });
}

// POST /api/research-products/admin/[id]/lab-reports
// Body: COA header fields, plus optional arrays:
//   results: [{ section, analyte, limit_spec?, result?, unit?, status?, position? }]
//   conformity_samples: [{ sample_label, purity_pct?, net_content_mg?, identification?, result?, is_representative?, position? }]
//   stats: [{ metric_name, mean_value?, std_dev?, unit?, position? }]
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  // Writes go through the service-role client — research_lab_reports* tables
  // now revoke INSERT/UPDATE/DELETE from `authenticated` entirely (2026-08-10
  // CoA-library audit: any signed-in customer could otherwise write directly
  // to lab-report data via the raw REST API). Identity is already verified
  // above via the cookie-bound client; this just does the actual work.
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

  const header = {
    product_id: id,
    variant_id: body.variant_id ?? null,
    lab_name: body.lab_name,
    lab_logo_url: body.lab_logo_url ?? null,
    lab_website: body.lab_website ?? null,
    coa_number: body.coa_number ?? null,
    access_code: body.access_code ?? null,
    verified: body.verified ?? true,
    pending: body.pending ?? false,
    product_label: body.product_label ?? null,
    lot_number: body.lot_number ?? null,
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
    position: typeof body.position === "number" ? body.position : 0,
  };

  const { data: report, error: reportErr } = await admin
    .from("research_lab_reports")
    .insert(header)
    .select("*")
    .single();

  if (reportErr) return jsonError(500, "LAB_REPORT_CREATE_FAILED", reportErr.message, reportErr);

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
