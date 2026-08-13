// app/api/creator/[id]/route.ts
// Admin: update a creator — change tier (promote/demote), pause/resume,
// rename their code, adjust their cash-out minimum.
import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAdmin } from "@/lib/creator-admin";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireCreatorAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json();
  const { tier_id, status, cashout_threshold_cents, notes, code } = body;

  const { data: creator, error: fetchError } = await guard.admin
    .from("creators")
    .select("id, discount_id")
    .eq("id", id)
    .single();

  if (fetchError || !creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // ── Tier change: mirrors onto the linked discount's percent_off ──────────
  if (tier_id) {
    const { data: tier, error: tierError } = await guard.admin
      .from("creator_tiers")
      .select("id, percent_off")
      .eq("id", tier_id)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const { error: discountUpdateError } = await guard.admin
      .from("discounts")
      .update({ percent_off: tier.percent_off, updated_at: new Date().toISOString() })
      .eq("id", creator.discount_id);

    if (discountUpdateError) {
      return NextResponse.json({ error: discountUpdateError.message }, { status: 500 });
    }
  }

  // ── Code rename ────────────────────────────────────────────────────────
  if (code && String(code).trim()) {
    const normalizedCode = String(code).trim().toUpperCase();

    const { data: existing } = await guard.admin
      .from("discounts")
      .select("id")
      .eq("code", normalizedCode)
      .neq("id", creator.discount_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: `Code "${normalizedCode}" is already in use.` }, { status: 400 });
    }

    const { error: codeError } = await guard.admin
      .from("discounts")
      .update({ code: normalizedCode, updated_at: new Date().toISOString() })
      .eq("id", creator.discount_id);

    if (codeError) {
      return NextResponse.json({ error: codeError.message }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tier_id) patch.tier_id = tier_id;
  if (status) patch.status = status;
  if (typeof cashout_threshold_cents === "number") patch.cashout_threshold_cents = cashout_threshold_cents;
  if (typeof notes === "string") patch.notes = notes;

  const { data: updated, error: updateError } = await guard.admin
    .from("creators")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Pausing/removing a creator also deactivates their code so it stops
  // applying at checkout.
  if (status === "paused" || status === "removed") {
    await guard.admin
      .from("discounts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", creator.discount_id);
  } else if (status === "active") {
    await guard.admin
      .from("discounts")
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq("id", creator.discount_id);
  }

  return NextResponse.json({ creator: updated });
}
