import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

export async function GET() {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const supabase = guard.admin;
    const { data, error } = await supabase
      .from("clickup_user_mapping")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return NextResponse.json({
          ok: true,
          data: [],
          warning:
            "Database table 'public.clickup_user_mapping' does not exist yet. Run supabase/migrations/20260801_peptide_requests_lims.sql in Supabase.",
        });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to fetch user mappings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const supabase = guard.admin;
    const body = await req.json();

    const {
      clickup_user_id,
      clickup_username,
      clickup_email,
      system_user_id,
      system_user_email,
    } = body;

    if (!clickup_user_id) {
      return NextResponse.json(
        { ok: false, error: "clickup_user_id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("clickup_user_mapping")
      .upsert(
        [
          {
            clickup_user_id,
            clickup_username: clickup_username || null,
            clickup_email: clickup_email || null,
            system_user_id: system_user_id || null,
            system_user_email: system_user_email || null,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "clickup_user_id" }
      )
      .select()
      .single();

    if (error) {
      if (
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("relation")
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Table 'public.clickup_user_mapping' does not exist. Please run supabase/migrations/20260801_peptide_requests_lims.sql in Supabase.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to save user mapping" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const guard = await requireAdmin();
    if (guard.error) return guard.error;
    const supabase = guard.admin;
    const { searchParams } = new URL(req.url);
    const clickup_user_id = searchParams.get("clickup_user_id");

    if (!clickup_user_id) {
      return NextResponse.json(
        { ok: false, error: "clickup_user_id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("clickup_user_mapping")
      .delete()
      .eq("clickup_user_id", clickup_user_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message || "Failed to delete mapping" },
      { status: 500 }
    );
  }
}
