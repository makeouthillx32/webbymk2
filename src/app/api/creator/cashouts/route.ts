// app/api/creator/cashouts/route.ts
// Admin: list cash-out requests across all creators.
import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAdmin } from "@/lib/creator-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const status = request.nextUrl.searchParams.get("status"); // optional filter

  let query = guard.admin
    .from("creator_cashouts")
    .select(
      `
      id, amount_cents, status, requested_at, resolved_at, failure_reason, admin_notes,
      creators (
        id,
        discounts ( code ),
        profiles ( id, display_name, first_name, last_name, email )
      )
    `
    )
    .order("requested_at", { ascending: false });

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cashouts: data ?? [] });
}
