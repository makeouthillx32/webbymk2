// app/api/discounts/route.ts
//
// Admin CRUD for discount codes. Previously the dashboard's Discounts screen
// (src/app/dashboard/[id]/settings/discounts/page.tsx) wrote directly to the
// `discounts` table from the browser with the anon key — no server route,
// no admin re-check. Found during the 2026-08-10 fund-management audit
// ahead of taking Stripe out of test mode: `discounts` had no RLS and
// `authenticated` held direct write grants, so any signed-in customer could
// mint themselves a 100%-off code via a raw REST call. Fixed by moving
// writes here (service-role client, admin-gated) and locking the table's
// grants down to read-only for anon/authenticated (see migration
// lock_down_discounts_writes).
//
// Also normalizes a real bug found in the same audit: the dashboard UI's
// type union is "percentage" | "fixed_amount", but checkout
// (app/api/checkout/create-payment-intent, app/api/research-checkout/...)
// and the apply_promo_code() RPC both only recognize type = 'fixed'. A
// dollar-off code created through the old direct-write path would show as
// "active" but silently discount $0. This route translates "fixed_amount"
// <-> "fixed" at the boundary so the DB always stores what checkout expects
// without having to touch the UI components' existing type unions.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const SELECT = "id,code,type,percent_off,amount_off_cents,is_active,starts_at,ends_at,max_uses,uses_count,created_at";

function toDbType(uiType: string) {
  return uiType === "fixed_amount" ? "fixed" : uiType;
}

function toUiRow(row: any) {
  return { ...row, type: row.type === "fixed" ? "fixed_amount" : row.type };
}

export async function GET() {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.admin
    .from("discounts")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (error) return jsonError(500, "DISCOUNTS_FETCH_FAILED", error.message);
  return NextResponse.json({ ok: true, data: (data ?? []).map(toUiRow) });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  if (!body?.code || typeof body.code !== "string" || !body.code.trim()) {
    return jsonError(400, "INVALID_CODE", "code is required");
  }
  if (body.type !== "percentage" && body.type !== "fixed_amount") {
    return jsonError(400, "INVALID_TYPE", "type must be 'percentage' or 'fixed_amount'");
  }
  if (body.type === "percentage") {
    const pct = Number(body.percent_off);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return jsonError(400, "INVALID_PERCENT_OFF", "percent_off must be between 0 and 100");
    }
  } else {
    const amt = Number(body.amount_off_cents);
    if (!Number.isFinite(amt) || amt <= 0) {
      return jsonError(400, "INVALID_AMOUNT_OFF", "amount_off_cents must be a positive number");
    }
  }

  const dbType = toDbType(body.type);
  const normalizedCode = body.code.trim().toUpperCase();

  const { data: existing } = await guard.admin
    .from("discounts")
    .select("id")
    .eq("code", normalizedCode)
    .maybeSingle();
  if (existing) return jsonError(400, "DUPLICATE_CODE", `Code "${normalizedCode}" is already in use.`);

  const { data, error } = await guard.admin
    .from("discounts")
    .insert({
      code: normalizedCode,
      type: dbType,
      percent_off: dbType === "percentage" ? Number(body.percent_off) : null,
      amount_off_cents: dbType === "fixed" ? Math.round(Number(body.amount_off_cents)) : null,
      is_active: body.is_active ?? true,
      starts_at: body.starts_at || null,
      ends_at: body.ends_at || null,
      max_uses: body.max_uses === undefined || body.max_uses === null ? null : Number(body.max_uses),
      updated_at: new Date().toISOString(),
    })
    .select(SELECT)
    .single();

  if (error) {
    const msg = error.message?.includes("duplicate") ? `Code "${normalizedCode}" is already in use.` : error.message;
    return jsonError(400, "DISCOUNT_CREATE_FAILED", msg);
  }

  return NextResponse.json({ ok: true, data: toUiRow(data) });
}
