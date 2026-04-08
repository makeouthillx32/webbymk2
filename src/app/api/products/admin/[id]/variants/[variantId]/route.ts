import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = { params: Promise<{ id: string; variantId: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false, status: 401 as const, message: "Authentication required" };
  return { ok: true as const };
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId, variantId } = await params;

  if (!productId) return jsonError(400, "INVALID_ID", "Missing product id");
  if (!variantId) return jsonError(400, "INVALID_VARIANT_ID", "Missing variant id");

  let input: any = null;
  try {
    input = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }
  input = input ?? {};

  // 1) Build variant update (ONLY columns that exist in Supabase)
  const variantUpdate: Record<string, any> = {};

  if ("title" in input) {
    if (!input.title || typeof input.title !== "string") {
      return jsonError(400, "INVALID_TITLE", "title must be a non-empty string");
    }
    variantUpdate.title = input.title;
  }

  if ("sku" in input) {
    if (input.sku !== null && typeof input.sku !== "string") {
      return jsonError(400, "INVALID_SKU", "sku must be a string or null");
    }
    variantUpdate.sku = input.sku;
  }

  if ("price_cents" in input) {
    const v = input.price_cents;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return jsonError(400, "INVALID_PRICE", "price_cents must be a number >= 0 or null");
    }
    variantUpdate.price_cents = v;
  }

  if ("compare_at_price_cents" in input) {
    const v = input.compare_at_price_cents;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return jsonError(400, "INVALID_COMPARE_PRICE", "compare_at_price_cents must be >= 0 or null");
    }
    variantUpdate.compare_at_price_cents = v;
  }

  if ("position" in input) {
    const v = input.position;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return jsonError(400, "INVALID_POSITION", "position must be a number >= 0");
    }
    variantUpdate.position = v;
  }

  if ("is_active" in input) {
    if (typeof input.is_active !== "boolean") {
      return jsonError(400, "INVALID_IS_ACTIVE", "is_active must be a boolean");
    }
    variantUpdate.is_active = input.is_active;
  }

  if ("weight_grams" in input) {
    const v = input.weight_grams;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return jsonError(400, "INVALID_WEIGHT", "weight_grams must be a number >= 0 or null");
    }
    variantUpdate.weight_grams = v;
  }

  if ("options" in input) {
    const v = input.options;
    if (v !== null && (typeof v !== "object" || Array.isArray(v))) {
      return jsonError(400, "INVALID_OPTIONS", "options must be a JSON object or null");
    }
    variantUpdate.options = v;
  }

  if ("option_values" in input) {
    const v = input.option_values;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
      return jsonError(400, "INVALID_OPTION_VALUES", "option_values must be an array of strings");
    }
    variantUpdate.option_values = v;
  }

  // 2) Inventory updates (source of truth = inventory table)
  // Accept legacy input names
  const wantsInventoryUpdate =
    ("inventory_enabled" in input) ||
    ("track_inventory" in input) ||
    ("allow_backorder" in input) ||
    ("stock_on_hand" in input) ||
    ("quantity" in input);

  let inventoryRow: any = null;

  if (wantsInventoryUpdate) {
    const invUpdate: Record<string, any> = {};

    if ("inventory_enabled" in input) {
      if (typeof input.inventory_enabled !== "boolean") {
        return jsonError(400, "INVALID_INVENTORY_ENABLED", "inventory_enabled must be boolean");
      }
      invUpdate.track_inventory = input.inventory_enabled;
      // mirror to variants
      variantUpdate.track_inventory = input.inventory_enabled;
    }

    if ("track_inventory" in input) {
      if (typeof input.track_inventory !== "boolean") {
        return jsonError(400, "INVALID_TRACK_INVENTORY", "track_inventory must be boolean");
      }
      invUpdate.track_inventory = input.track_inventory;
      variantUpdate.track_inventory = input.track_inventory;
    }

    if ("allow_backorder" in input) {
      if (typeof input.allow_backorder !== "boolean") {
        return jsonError(400, "INVALID_BACKORDER", "allow_backorder must be boolean");
      }
      invUpdate.allow_backorder = input.allow_backorder;
      variantUpdate.allow_backorder = input.allow_backorder;
    }

    // stock_on_hand (legacy) OR quantity (preferred)
    if ("stock_on_hand" in input || "quantity" in input) {
      const raw = "quantity" in input ? input.quantity : input.stock_on_hand;
      const q = Number(raw);
      if (!Number.isFinite(q) || q < 0) {
        return jsonError(400, "INVALID_QUANTITY", "quantity/stock_on_hand must be a number >= 0");
      }
      invUpdate.quantity = q;
      // mirror cache column on variants
      variantUpdate.inventory_qty = q;
    }

    // Upsert into inventory by variant_id
    const { data: invData, error: invErr } = await supabase
      .from("inventory")
      .upsert({ variant_id: variantId, ...invUpdate }, { onConflict: "variant_id" })
      .select("*")
      .single();

    if (invErr) return jsonError(500, "INVENTORY_UPDATE_FAILED", invErr.message, invErr);
    inventoryRow = invData;
  }

  if (Object.keys(variantUpdate).length === 0 && !wantsInventoryUpdate) {
    return jsonError(400, "NO_FIELDS", "No updatable fields were provided");
  }

  // 3) Apply variant update (scoped to product)
  // If we only updated inventory, still verify the variant belongs to product.
  const { data: variantRow, error: vErr } = await supabase
    .from("product_variants")
    .update(variantUpdate)
    .eq("id", variantId)
    .eq("product_id", productId)
    .select("*")
    .single();

  if (vErr) {
    const status = vErr.code === "PGRST116" || /0 rows/i.test(vErr.message) ? 404 : 500;
    return jsonError(
      status,
      status === 404 ? "NOT_FOUND" : "VARIANT_UPDATE_FAILED",
      status === 404 ? "Variant not found for this product" : vErr.message,
      vErr
    );
  }

  return NextResponse.json({ ok: true, data: { variant: variantRow, inventory: inventoryRow } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId, variantId } = await params;

  if (!productId) return jsonError(400, "INVALID_ID", "Missing product id");
  if (!variantId) return jsonError(400, "INVALID_VARIANT_ID", "Missing variant id");

  const { data, error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId)
    .eq("product_id", productId)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(
      status,
      status === 404 ? "NOT_FOUND" : "VARIANT_DELETE_FAILED",
      status === 404 ? "Variant not found for this product" : error.message,
      error
    );
  }

  return NextResponse.json({ ok: true, data });
}