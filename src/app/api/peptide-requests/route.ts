import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const supabase = guard.admin;
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const q = searchParams.get("q");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("peptide_requests")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (q) {
      query = query.or(
        `compound_name.ilike.%${q}%,requester_name.ilike.%${q}%,requester_email.ilike.%${q}%,cas_number.ilike.%${q}%`
      );
    }

    const { data, count, error } = await query;

    if (error) {
      // Gracefully handle unmigrated database table
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return NextResponse.json({
          ok: true,
          data: [],
          total: 0,
          limit,
          offset,
          warning:
            "Database table 'public.peptide_requests' does not exist yet. Run supabase/migrations/20260801_peptide_requests_lims.sql in Supabase SQL Editor.",
        });
      }

      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to fetch peptide requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createAdminClient();
    const body = await req.json();

    const {
      compound_name,
      cas_number,
      molecular_formula,
      molecular_weight,
      purity_requirement,
      quantity_requested,
      intended_use,
      notes,
      requester_name,
      requester_email,
      requester_company,
    } = body;

    if (!compound_name || !requester_name || !requester_email) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required fields: compound_name, requester_name, requester_email",
        },
        { status: 400 }
      );
    }

    const { data: request, error: insertError } = await supabase
      .from("peptide_requests")
      .insert([
        {
          compound_name,
          cas_number: cas_number || null,
          molecular_formula: molecular_formula || null,
          molecular_weight: molecular_weight ? parseFloat(molecular_weight) : null,
          purity_requirement: purity_requirement || null,
          quantity_requested: quantity_requested || null,
          intended_use: intended_use || null,
          notes: notes || null,
          requester_name,
          requester_email,
          requester_company: requester_company || null,
          status: "new",
        },
      ])
      .select()
      .single();

    if (insertError || !request) {
      if (
        insertError?.code === "42P01" ||
        insertError?.message?.includes("does not exist") ||
        insertError?.message?.includes("relation")
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Database table 'public.peptide_requests' does not exist. Please run supabase/migrations/20260801_peptide_requests_lims.sql in Supabase.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { ok: false, error: insertError?.message || "Failed to create peptide request" },
        { status: 500 }
      );
    }

    // Write initial status log
    await supabase.from("peptide_request_status_log").insert([
      {
        request_id: request.id,
        old_status: null,
        new_status: "new",
        changed_by: requester_email,
        source: "customer_portal",
        notes: "Peptide request submitted",
      },
    ]);

    return NextResponse.json({ ok: true, data: request }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to create request" },
      { status: 500 }
    );
  }
}
