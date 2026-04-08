import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  return { ok: true };
}

/**
 * POST /api/inventory/movements
 *
 * Insert an inventory movement row using the ACTUAL schema:
 * - delta_qty (signed integer, not just "quantity")
 * - reason (not "movement_type")
 *
 * Body:
 * {
 *   "variant_id": "uuid",               // required
 *   "delta_qty": 5,                     // required (positive = add, negative = remove)
 *   "reason": "initial" | "restock" | "sale" | "refund" | "adjustment" | "damage" | "return" | "transfer",
 *   "note": "optional text",            // optional
 *   "reference_type": "orders",         // optional (e.g., "orders", "purchase_orders", "manual")
 *   "reference_id": "uuid"              // optional (order id / external ref)
 * }
 *
 * Notes:
 * - delta_qty is SIGNED: positive = add stock, negative = remove stock
 * - reason must match DB constraint
 * - The database trigger should apply the movement to inventory.quantity
 */
export async function POST(req: NextRequest) {
  // ✅ FIX: Await the createServerClient call
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required");
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const variant_id = body?.variant_id;
  const delta_qty = body?.delta_qty;
  const reason = body?.reason;
  const note = body?.note ?? null;
  const reference_type = body?.reference_type ?? null;
  const reference_id = body?.reference_id ?? null;

  if (!variant_id || typeof variant_id !== "string") {
    return jsonError(400, "INVALID_VARIANT_ID", "variant_id is required");
  }

  // ✅ FIX: Use "reason" not "movement_type"
  const validReasons = [
    "initial",
    "restock", 
    "sale", 
    "refund", 
    "adjustment", 
    "damage", 
    "return", 
    "transfer"
  ];

  if (!reason || typeof reason !== "string" || !validReasons.includes(reason)) {
    return jsonError(
      400,
      "INVALID_REASON",
      `reason must be one of: ${validReasons.join(", ")}`
    );
  }

  // ✅ FIX: Use "delta_qty" (signed) not "quantity" (unsigned)
  if (
    typeof delta_qty !== "number" ||
    !Number.isFinite(delta_qty) ||
    !Number.isInteger(delta_qty) ||
    delta_qty === 0  // DB constraint: delta_qty <> 0
  ) {
    return jsonError(
      400, 
      "INVALID_DELTA_QTY", 
      "delta_qty must be a non-zero integer (positive = add, negative = remove)"
    );
  }

  // ✅ FIX: Insert using actual column names
  const { data, error } = await supabase
    .from("inventory_movements")
    .insert({
      variant_id,
      delta_qty,           // ✅ Correct column name
      reason,              // ✅ Correct column name
      note,
      reference_type,      // ✅ Correct column name
      reference_id,        // ✅ Correct column name
    })
    .select()
    .single();

  if (error) {
    return jsonError(500, "MOVEMENT_CREATE_FAILED", error.message);
  }

  // Optional: Return updated inventory snapshot
  const { data: inventory } = await supabase
    .from("inventory")
    .select("*")
    .eq("variant_id", variant_id)
    .single();

  return NextResponse.json({ 
    ok: true, 
    data: {
      movement: data,
      inventory
    }
  });
}