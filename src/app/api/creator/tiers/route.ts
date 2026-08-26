// app/api/creator/tiers/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAdmin } from "@/lib/creator-admin";

export const dynamic = "force-dynamic";

// GET — list tiers (admin dashboard: tier picker + management)
export async function GET() {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.admin
    .from("creator_tiers")
    .select("id, name, percent_off, sort_order, is_active, created_at")
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tiers: data ?? [] });
}

// POST — create a new tier (e.g. a "25% — VIP" tier for standout creators)
export async function POST(request: NextRequest) {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const { name, percent_off, sort_order } = body;

  if (!name || typeof percent_off !== "number" || percent_off <= 0 || percent_off > 100) {
    return NextResponse.json(
      { error: "name and a percent_off between 0 and 100 are required" },
      { status: 400 }
    );
  }

  const { data, error } = await guard.admin
    .from("creator_tiers")
    .insert({ name, percent_off, sort_order: sort_order ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tier: data });
}
