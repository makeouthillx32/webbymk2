import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false, status: 401 as const, message: "Authentication required" };
  return { ok: true as const };
}

/**
 * POST /api/products/admin/[id]/variants
 *
 * Body supports:
 * {
 *   "title": "Default",                 // required
 *   "sku": "SKU-123",                   // optional
 *   "price_cents": 1999,                // optional (defaults to product price_cents)
 *   "compare_at_price_cents": 2499,     // optional
 *   "weight_grams": 310,                // optional
 *   "position": 0,                      // optional (defaults to append)
 *   "options": {                        // ✅ NEW! Store variant attributes
 *     "size": "S",
 *     "color": {"name": "Brown", "hex": "#8B4513"},
 *     "material": "Cotton Blend",
 *     "made_in": "USA"
 *   },
 *
 *   // inventory (aligned to Supabase schema)
 *   "track_inventory": true,            // optional (or legacy: inventory_enabled)
 *   "allow_backorder": false,           // optional
 *   "quantity": 10                      // optional (or legacy: stock_on_hand)
 * }
 */
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId } = await params;
  if (!productId) return jsonError(400, "INVALID_ID", "Missing product id");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const title = body?.title;
  if (!title || typeof title !== "string") {
    return jsonError(400, "INVALID_INPUT", "title is required");
  }

  const sku = body?.sku ?? null;
  if (sku !== null && typeof sku !== "string") {
    return jsonError(400, "INVALID_SKU", "sku must be a string or null");
  }

  // ✅ NEW: Extract options field (size, color, material, made_in, etc.)
  const options = body?.options ?? {};
  if (typeof options !== "object" || Array.isArray(options)) {
    return jsonError(400, "INVALID_OPTIONS", "options must be an object");
  }

  // ✅ NEW: Extract weight_grams
  const weight_grams = body?.weight_grams ?? null;
  if (weight_grams !== null && (typeof weight_grams !== "number" || weight_grams < 0)) {
    return jsonError(400, "INVALID_WEIGHT", "weight_grams must be a number >= 0 or null");
  }

  // position: append by default
  const positionRaw = body?.position;
  let position: number;

  if (typeof positionRaw === "number") {
    if (!Number.isFinite(positionRaw) || positionRaw < 0) {
      return jsonError(400, "INVALID_POSITION", "position must be a number >= 0");
    }
    position = positionRaw;
  } else {
    const { data: existing, error: existingErr } = await supabase
      .from("product_variants")
      .select("position")
      .eq("product_id", productId)
      .order("position", { ascending: false })
      .limit(1);

    if (existingErr) return jsonError(500, "VARIANT_POSITION_LOOKUP_FAILED", existingErr.message, existingErr);

    const maxPos =
      existing && existing.length > 0 && typeof existing[0].position === "number"
        ? existing[0].position
        : -1;

    position = maxPos + 1;
  }

  // price default: product.price_cents
  let price_cents = body?.price_cents;
  if (price_cents == null) {
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("price_cents")
      .eq("id", productId)
      .single();

    if (productErr) return jsonError(500, "PRODUCT_PRICE_LOOKUP_FAILED", productErr.message, productErr);
    price_cents = product.price_cents;
  }

  if (typeof price_cents !== "number" || !Number.isFinite(price_cents) || price_cents < 0) {
    return jsonError(400, "INVALID_PRICE", "price_cents must be a number >= 0");
  }

  const compare_at_price_cents = body?.compare_at_price_cents ?? null;
  if (
    compare_at_price_cents !== null &&
    (typeof compare_at_price_cents !== "number" ||
      !Number.isFinite(compare_at_price_cents) ||
      compare_at_price_cents < 0)
  ) {
    return jsonError(400, "INVALID_COMPARE_PRICE", "compare_at_price_cents must be >= 0 or null");
  }

  // Inventory inputs (support legacy names)
  const track_inventory =
    typeof body?.track_inventory === "boolean"
      ? body.track_inventory
      : typeof body?.inventory_enabled === "boolean"
        ? body.inventory_enabled
        : false;

  const allow_backorder =
    typeof body?.allow_backorder === "boolean" ? body.allow_backorder : false;

  const quantityRaw = body?.quantity ?? body?.stock_on_hand ?? null;
  const quantity =
    quantityRaw == null ? null : Number(quantityRaw);

  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
    return jsonError(400, "INVALID_QUANTITY", "quantity/stock_on_hand must be a number >= 0");
  }

  // 1) Create variant row with ALL fields including options
  const { data: variant, error: vErr } = await supabase
    .from("product_variants")
    .insert({
      product_id: productId,
      title,
      sku,
      options,              // ✅ ADDED: Store size, color, material, made_in
      weight_grams,         // ✅ ADDED: Store weight
      price_cents,
      compare_at_price_cents,
      position,
      track_inventory,
      allow_backorder,
      // mirror cache if provided
      inventory_qty: quantity ?? 0,
    })
    .select("*")
    .single();

  if (vErr) return jsonError(500, "VARIANT_CREATE_FAILED", vErr.message, vErr);

  // 2) Upsert inventory row (source of truth) if caller provided quantity or track_inventory/backorder
  let inventoryRow: any = null;
  const wantsInventory =
    ("track_inventory" in (body ?? {})) ||
    ("inventory_enabled" in (body ?? {})) ||
    ("allow_backorder" in (body ?? {})) ||
    ("quantity" in (body ?? {})) ||
    ("stock_on_hand" in (body ?? {}));

  if (wantsInventory) {
    const { data: inv, error: invErr } = await supabase
      .from("inventory")
      .upsert(
        {
          variant_id: variant.id,
          track_inventory,
          allow_backorder,
          quantity: quantity ?? 0,
        },
        { onConflict: "variant_id" }
      )
      .select("*")
      .single();

    if (invErr) return jsonError(500, "INVENTORY_CREATE_FAILED", invErr.message, invErr);
    inventoryRow = inv;
  }

  return NextResponse.json({ ok: true, data: { variant, inventory: inventoryRow } });
}