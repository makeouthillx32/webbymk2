// app/api/creator/me/route.ts
// Customer-facing: the current user's own creator record, if they have one.
// Returns { creator: null } (not a 404) when the profile isn't a creator, so
// the profile-page block can just render nothing.
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: creator, error } = await admin
    .from("creators")
    .select(
      `
      id, status, balance_cents, lifetime_earned_cents, lifetime_paid_cents,
      cashout_threshold_cents, created_at,
      creator_tiers ( name, percent_off ),
      discounts ( code )
    `
    )
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!creator) return NextResponse.json({ creator: null });

  const [{ data: ledger }, { data: cashouts }] = await Promise.all([
    admin
      .from("creator_ledger_entries")
      .select("id, order_number, kind, amount_cents, description, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })
      .limit(25),
    admin
      .from("creator_cashouts")
      .select("id, amount_cents, status, requested_at, resolved_at, failure_reason")
      .eq("creator_id", creator.id)
      .order("requested_at", { ascending: false })
      .limit(10),
  ]);

  return NextResponse.json({
    creator,
    ledger: ledger ?? [],
    cashouts: cashouts ?? [],
  });
}
