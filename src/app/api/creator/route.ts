// app/api/creator/route.ts
// Admin: list creators, and turn an existing profile into a creator.
import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAdmin } from "@/lib/creator-admin";

export const dynamic = "force-dynamic";

// GET — list every creator with their profile, tier, and code attached.
export async function GET() {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.admin
    .from("creators")
    .select(
      `
      id, status, balance_cents, lifetime_earned_cents, lifetime_paid_cents,
      cashout_threshold_cents, notes, created_at, updated_at,
      profiles ( id, display_name, first_name, last_name, email, avatar_url ),
      creator_tiers ( id, name, percent_off ),
      discounts ( id, code, is_active, percent_off, uses_count )
    `
    )
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ creators: data ?? [] });
}

// POST — create a creator: makes the discount code + the creator record together.
export async function POST(request: NextRequest) {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const body = await request.json();
  const { profile_id, tier_id, code, cashout_threshold_cents } = body;

  if (!profile_id || !tier_id || !code || !String(code).trim()) {
    return NextResponse.json(
      { error: "profile_id, tier_id, and code are required" },
      { status: 400 }
    );
  }

  const { data: tier, error: tierError } = await guard.admin
    .from("creator_tiers")
    .select("id, percent_off")
    .eq("id", tier_id)
    .single();

  if (tierError || !tier) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }

  const normalizedCode = String(code).trim().toUpperCase();

  const { data: existing } = await guard.admin
    .from("discounts")
    .select("id")
    .eq("code", normalizedCode)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: `Code "${normalizedCode}" is already in use.` }, { status: 400 });
  }

  const { data: discount, error: discountError } = await guard.admin
    .from("discounts")
    .insert({
      code: normalizedCode,
      type: "percentage",
      percent_off: tier.percent_off,
      is_active: true,
    })
    .select("id, code")
    .single();

  if (discountError || !discount) {
    const msg = discountError?.message?.includes("duplicate")
      ? `Code "${normalizedCode}" is already in use.`
      : discountError?.message ?? "Failed to create discount code";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: creator, error: creatorError } = await guard.admin
    .from("creators")
    .insert({
      profile_id,
      tier_id,
      discount_id: discount.id,
      cashout_threshold_cents: cashout_threshold_cents ?? 10000,
    })
    .select()
    .single();

  if (creatorError) {
    // Roll back the discount row if the creator insert failed (e.g. profile
    // is already a creator) so we don't leave an orphaned code behind.
    await guard.admin.from("discounts").delete().eq("id", discount.id);
    const msg = creatorError.message?.includes("duplicate")
      ? "That profile is already set up as a creator."
      : creatorError.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Becoming a creator IS becoming an affiliate in the account-tier model —
  // affiliate sits above researcher as the top public tier (see the
  // 2026-08-10 role-ladder migration). Upgrade-only: never demote an admin
  // by routing them through this flow.
  const { data: existingProfile } = await guard.admin
    .from("profiles")
    .select("role")
    .eq("id", profile_id)
    .single();

  if (existingProfile && existingProfile.role !== "admin" && existingProfile.role !== "affiliate") {
    await guard.admin.from("profiles").update({ role: "affiliate" }).eq("id", profile_id);
  }

  return NextResponse.json({ creator });
}
