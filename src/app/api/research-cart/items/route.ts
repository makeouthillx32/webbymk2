// app/api/research-cart/items/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { requireResearcherRole } from "@/lib/research/requireResearcherRole";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function getUserId(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

async function getOrCreateActiveCartId(supabase: any, userId: string) {
  const { data: cart } = await supabase
    .from("research_carts")
    .select("id")
    .eq("status", "active")
    .eq("user_id", userId)
    .single();

  if (cart?.id) return cart.id;

  const { data: newCart, error: createError } = await supabase
    .from("research_carts")
    .insert({ user_id: userId, status: "active" })
    .select("id")
    .single();

  if (createError || !newCart?.id) return null;
  return newCart.id;
}

function pickPrimaryImage(images: any[]) {
  if (!images?.length) return null;
  return [...images].sort((a, b) => {
    if (b.is_primary && !a.is_primary) return 1;
    if (a.is_primary && !b.is_primary) return -1;
    const apos = a.position ?? 9999;
    const bpos = b.position ?? 9999;
    if (apos !== bpos) return apos - bpos;
    return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
  })[0];
}

// ─────────────────────────────────────────────
// POST /api/research-cart/items — add item to research cart
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await createServerClient();
    const supabase = createAdminClient();
    const userId = await getUserId(auth);

    if (!userId) {
      return jsonError(401, "AUTH_REQUIRED", "Sign in to add items to your research cart");
    }

    const roleGate = await requireResearcherRole(supabase, userId);
    if (roleGate.ok === false) {
      return jsonError(roleGate.status, roleGate.code, roleGate.message);
    }

    const body = await request.json();
    const { research_product_id, research_variant_id = null, quantity = 1 } = body ?? {};

    if (!research_product_id) {
      return jsonError(400, "MISSING_PRODUCT", "research_product_id is required");
    }
    if (quantity < 1 || quantity > 99) {
      return jsonError(400, "BAD_QTY", "Quantity must be between 1 and 99");
    }

    // Resolve price + snapshot fields — from the variant if provided, else the product
    let price_cents: number;
    let product_title: string;
    let variant_title: string | null = null;
    let dosage_label: string | null = null;

    const { data: product, error: productError } = await supabase
      .from("research_products")
      .select("id, title, price_cents, dosage_label, status")
      .eq("id", research_product_id)
      .single();

    if (productError || !product) {
      return jsonError(404, "PRODUCT_NOT_FOUND", "Research product not found", productError);
    }
    if (product.status !== "active") {
      return jsonError(400, "PRODUCT_INACTIVE", "This product is no longer available");
    }

    product_title = product.title;
    price_cents = product.price_cents;
    dosage_label = product.dosage_label ?? null;

    if (research_variant_id) {
      const { data: variant, error: variantError } = await supabase
        .from("research_product_variants")
        .select("id, title, price_cents, inventory_qty, track_inventory, is_active")
        .eq("id", research_variant_id)
        .single();

      if (variantError || !variant) {
        return jsonError(404, "VARIANT_NOT_FOUND", "Variant not found", variantError);
      }
      if (!variant.is_active) {
        return jsonError(400, "VARIANT_INACTIVE", "This variant is no longer available");
      }
      if (variant.track_inventory && variant.inventory_qty < quantity) {
        return jsonError(400, "OUT_OF_STOCK", `Only ${variant.inventory_qty} items in stock`);
      }

      variant_title = variant.title;
      price_cents = variant.price_cents;
    }

    // Primary image snapshot
    const { data: images } = await supabase
      .from("research_product_images")
      .select("bucket_name, object_path, alt_text, position, sort_order, is_primary")
      .eq("product_id", research_product_id);

    const primary = pickPrimaryImage(images ?? []);
    const image_url = supabasePublicUrlFromImage(primary);

    const cartId = await getOrCreateActiveCartId(supabase, userId);
    if (!cartId) {
      return jsonError(500, "CART_CREATE_FAILED", "Failed to create research cart");
    }

    // Merge with existing line for the same product+variant combo
    let existingQuery = supabase
      .from("research_cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("research_product_id", research_product_id);

    existingQuery = research_variant_id
      ? existingQuery.eq("research_variant_id", research_variant_id)
      : existingQuery.is("research_variant_id", null);

    const { data: existingItem } = await existingQuery.single();

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;
      const { error: updateError } = await supabase
        .from("research_cart_items")
        .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
        .eq("id", existingItem.id);

      if (updateError) {
        return jsonError(500, "CART_ITEM_UPDATE_FAILED", "Failed to update cart item", updateError);
      }
      return jsonOk({ item_id: existingItem.id, cart_id: cartId, updated: true });
    }

    const { data: newItem, error: insertError } = await supabase
      .from("research_cart_items")
      .insert({
        cart_id: cartId,
        research_product_id,
        research_variant_id,
        quantity,
        price_cents,
        product_title,
        variant_title,
        dosage_label,
        image_url,
      })
      .select("id")
      .single();

    if (insertError || !newItem?.id) {
      return jsonError(500, "CART_ITEM_INSERT_FAILED", "Failed to add item to research cart", insertError);
    }

    return jsonOk({ item_id: newItem.id, cart_id: cartId, created: true });
  } catch (err) {
    console.error("Add to research cart error:", err);
    return jsonError(500, "INTERNAL", "Internal server error", err);
  }
}
