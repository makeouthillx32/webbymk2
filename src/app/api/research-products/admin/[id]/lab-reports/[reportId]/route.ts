// app/api/research-products/admin/[id]/lab-reports/[reportId]/route.ts
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

const HEADER_FIELDS = [
  "variant_id",
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
// Updates any provided header fields. If results / conformity_samples / stats
// arrays are provided, the existing child rows are fully replaced (delete +
// reinsert) — simplest correct behavior for a form that resubmits whole lists.
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);
  // See route.ts POST — writes must go through the service-role client now
  // that research_lab_reports* revokes authenticated INSERT/UPDATE/DELETE.
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

  if (Object.keys(patch).length > 0) {
    const { error } = await admin
      .from("research_lab_reports")
      .update(patch)
      .eq("id", reportId)
      .eq("product_id", id);
    if (error) return jsonError(500, "LAB_REPORT_UPDATE_FAILED", error.message, error);
  }

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
// Child rows cascade via FK.
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
