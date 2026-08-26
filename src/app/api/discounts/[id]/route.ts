// app/api/discounts/[id]/route.ts
// PATCH (full edit or quick is_active toggle) / DELETE for a single discount
// code. See route.ts for why this exists — admin-gated, service-role writes,
// replacing what used to be a direct browser Supabase call.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string }> };

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

export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };

  if ("is_active" in body) patch.is_active = !!body.is_active;

  // Full-edit fields — only validated/applied if the caller is actually
  // editing them (the quick "toggle active" action only sends is_active).
  if ("code" in body) {
    if (!body.code || typeof body.code !== "string" || !body.code.trim()) {
      return jsonError(400, "INVALID_CODE", "code must be a non-empty string");
    }
    patch.code = body.code.trim().toUpperCase();
  }
  if ("type" in body) {
    if (body.type !== "percentage" && body.type !== "fixed_amount") {
      return jsonError(400, "INVALID_TYPE", "type must be 'percentage' or 'fixed_amount'");
    }
    patch.type = toDbType(body.type);
  }
  if ("percent_off" in body) {
    patch.percent_off = body.percent_off === null ? null : Number(body.percent_off);
  }
  if ("amount_off_cents" in body) {
    patch.amount_off_cents = body.amount_off_cents === null ? null : Math.round(Number(body.amount_off_cents));
  }
  if ("starts_at" in body) patch.starts_at = body.starts_at || null;
  if ("ends_at" in body) patch.ends_at = body.ends_at || null;
  if ("max_uses" in body) patch.max_uses = body.max_uses === null ? null : Number(body.max_uses);

  if (patch.type === "percentage" && patch.percent_off != null) {
    if (!Number.isFinite(patch.percent_off) || patch.percent_off <= 0 || patch.percent_off > 100) {
      return jsonError(400, "INVALID_PERCENT_OFF", "percent_off must be between 0 and 100");
    }
  }

  const { data, error } = await guard.admin
    .from("discounts")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) {
    const msg = error.message?.includes("duplicate") ? "That code is already in use." : error.message;
    return jsonError(400, "DISCOUNT_UPDATE_FAILED", msg);
  }

  return NextResponse.json({ ok: true, data: toUiRow(data) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const guard = await requireAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;

  const { error } = await guard.admin.from("discounts").delete().eq("id", id);
  if (error) {
    // A creator's discount_id has ON DELETE RESTRICT — surface that plainly
    // instead of a raw FK-violation message.
    const msg = error.message?.includes("violates foreign key")
      ? "This code is linked to a creator/affiliate account — remove that link first."
      : error.message;
    return jsonError(400, "DISCOUNT_DELETE_FAILED", msg);
  }

  return NextResponse.json({ ok: true });
}
