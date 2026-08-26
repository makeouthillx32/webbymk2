import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const { id } = await params;
    const supabase = guard.admin;

    const { data: request, error } = await supabase
      .from("peptide_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !request) {
      return NextResponse.json(
        { ok: false, error: "Peptide request not found" },
        { status: 404 }
      );
    }

    const { data: history } = await supabase
      .from("peptide_request_status_log")
      .select("*")
      .eq("request_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      ok: true,
      data: {
        ...request,
        history: history || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to fetch request detail" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const { id } = await params;
    const supabase = guard.admin;
    const body = await req.json();

    const { status, notes, changed_by } = body;

    const { data: existing, error: fetchErr } = await supabase
      .from("peptide_requests")
      .select("status")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) {
      return NextResponse.json(
        { ok: false, error: "Peptide request not found" },
        { status: 404 }
      );
    }

    const oldStatus = existing.status;
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (status && status !== oldStatus) {
      updatePayload.status = status;
      updatePayload.previous_status = oldStatus;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("peptide_requests")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    if (status && status !== oldStatus) {
      await supabase.from("peptide_request_status_log").insert([
        {
          request_id: id,
          old_status: oldStatus,
          new_status: status,
          changed_by: changed_by || "admin",
          source: "lims_dashboard",
          notes: notes || null,
        },
      ]);
    }

    return NextResponse.json({ ok: true, data: updated });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to update request" },
      { status: 500 }
    );
  }
}
