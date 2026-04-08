// app/api/cart/items/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any, meta?: any) {
  return NextResponse.json({ ok: true, data, meta });
}

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function getIdentity(req: NextRequest, supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const sessionId = req.headers.get("x-session-id");
  const { data: { user }, error } = await supabase.auth.getUser();
  const userId = !error ? user?.id : undefined;
  if (!userId && !sessionId) return null;
  return { userId: userId ?? null, sessionId: sessionId ?? null };
}

async function getOrCreateActiveCartId(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  identity: { userId: string | null; sessionId: string | null },
  createIfMissing: boolean
) {
  let cartQuery = supabase
    .from("carts")
    .select("id")
    .eq("status", "active")
    .single();

  cartQuery = identity.userId
    ? cartQuery.eq("user_id", identity.userId)
    : cartQuery.eq("session_id", identity.sessionId);

  const { data: cart } = await cartQuery;
  if (cart?.id) return cart.id;

  if (!createIfMissing) return null;

  const { data: newCart, error: createError } = await supabase
    .from("carts")
    .insert({
      user_id: identity.userId,
      session_id: identity.sessionId,
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !newCart?.id) return null;
  return newCart.id;
}

/**
 * Picks the best image for a product:
 * 1. is_primary = true
 * 2. lowest position
 * 3. lowest sort_order
 */
function pickPrimaryImage(images: any[]) {
  if (!images?.length) return null;
  return [...images].sort((a, b) => {
    // Primary first
    if (b.is_primary && !a.is_primary) return 1;
    if (a.is_primary && !b.is_primary) return -1;
    // Then by position
    const apos = a.position ?? 9999;
    const bpos = b.position ?? 9999;
    if (apos !== bpos) return apos - bpos;
    // Then by sort_order
    return (a.sort_order ?? 9999) - (b.sort_order ?? 9999);
  })[0];
}

// ─────────────────────────────────────────────
// GET /api/cart/items — fetch cart with images
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const identity = await getIdentity(request, supabase);

    if (!identity) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    const cartId = await getOrCreateActiveCartId(supabase, identity, false);
    if (!cartId) {
      return jsonOk({ cart_id: null, items: [] });
    }

    // 1) Fetch cart items + product + variant
    const { data: items, error: itemsError } = await supabase
      .from("cart_items")
      .select(`
        id,
        cart_id,
        product_id,
        variant_id,
        quantity,
        price_cents,
        created_at,
        products:products (
          id,
          title,
          slug
        ),
        variants:product_variants (
          id,
          title,
          sku,
          option_values,
          options,
          price_cents
        )
      `)
      .eq("cart_id", cartId)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return jsonError(500, "CART_ITEMS_FETCH_FAILED", "Failed to fetch cart items", itemsError);
    }

    const productIds = Array.from(
      new Set((items ?? []).map((i: any) => i.product_id).filter(Boolean))
    );

    let imagesByProductId = new Map<string, any[]>();

    // 2) Fetch product_images for all products in cart (single query)
    // NOTE: No is_public filter — some images may have is_public = null which would
    // be excluded by .eq("is_public", true). We filter nulls out safely below.
    if (productIds.length) {
      const { data: images, error: imagesError } = await supabase
        .from("product_images")
        .select("id, product_id, bucket_name, object_path, alt_text, position, sort_order, is_primary, is_public")
        .in("product_id", productIds)
        .neq("is_public", false); // allow true OR null — exclude only explicitly false

      if (imagesError) {
        console.error("Cart images fetch error:", imagesError);
        // Don't fail the whole cart — just continue without images
      } else {
        for (const img of images ?? []) {
          const pid = img.product_id as string;
          const arr = imagesByProductId.get(pid) ?? [];
          arr.push(img);
          imagesByProductId.set(pid, arr);
        }
      }
    }

    // 3) Build enriched items with image_url
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    const enriched = (items ?? []).map((item: any) => {
      const imgs = imagesByProductId.get(item.product_id) ?? [];
      const primary = pickPrimaryImage(imgs);

      let image_url: string | null = null;
      let image_alt: string | null = null;

      if (primary?.bucket_name && primary?.object_path) {
        // Build URL directly — avoids an extra async call per item
        image_url = `${supabaseUrl}/storage/v1/object/public/${primary.bucket_name}/${primary.object_path}`;
        image_alt = primary.alt_text ?? null;
      }

      return {
        id: item.id,
        cart_id: item.cart_id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_cents: item.price_cents,
        product: item.products ?? null,
        variant: item.variants ?? null,
        image_url,
        image_alt,
      };
    });

    return jsonOk({ cart_id: cartId, items: enriched });
  } catch (err) {
    console.error("Cart GET error:", err);
    return jsonError(500, "INTERNAL", "Internal server error", err);
  }
}

// ─────────────────────────────────────────────
// POST /api/cart/items — add item to cart
// ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const identity = await getIdentity(request, supabase);

    if (!identity) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    const body = await request.json();
    const { variant_id, quantity = 1 } = body ?? {};

    if (!variant_id) {
      return jsonError(400, "MISSING_VARIANT", "variant_id is required");
    }

    if (quantity < 1 || quantity > 99) {
      return jsonError(400, "BAD_QTY", "Quantity must be between 1 and 99");
    }

    // Get variant details
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .select("id, product_id, price_cents, inventory_qty, is_active")
      .eq("id", variant_id)
      .single();

    if (variantError || !variant) {
      return jsonError(404, "VARIANT_NOT_FOUND", "Variant not found", variantError);
    }

    if (!variant.is_active) {
      return jsonError(400, "VARIANT_INACTIVE", "This product variant is no longer available");
    }

    if (variant.inventory_qty < quantity) {
      return jsonError(400, "OUT_OF_STOCK", `Only ${variant.inventory_qty} items in stock`);
    }

    const cartId = await getOrCreateActiveCartId(supabase, identity, true);
    if (!cartId) {
      return jsonError(500, "CART_CREATE_FAILED", "Failed to create cart");
    }

    // Check for existing item with same variant
    const { data: existingItem } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cartId)
      .eq("variant_id", variant_id)
      .single();

    if (existingItem) {
      const newQuantity = existingItem.quantity + quantity;

      if (variant.inventory_qty < newQuantity) {
        return jsonError(400, "OUT_OF_STOCK", `Only ${variant.inventory_qty} items in stock`);
      }

      const { error: updateError } = await supabase
        .from("cart_items")
        .update({ quantity: newQuantity })
        .eq("id", existingItem.id);

      if (updateError) {
        return jsonError(500, "CART_ITEM_UPDATE_FAILED", "Failed to update cart item", updateError);
      }

      return jsonOk({ item_id: existingItem.id, cart_id: cartId, updated: true });
    }

    // Insert new item
    const { data: newItem, error: insertError } = await supabase
      .from("cart_items")
      .insert({
        cart_id: cartId,
        product_id: variant.product_id,
        variant_id: variant.id,
        quantity,
        price_cents: variant.price_cents,
      })
      .select("id")
      .single();

    if (insertError || !newItem?.id) {
      return jsonError(500, "CART_ITEM_INSERT_FAILED", "Failed to add item to cart", insertError);
    }

    return jsonOk({ item_id: newItem.id, cart_id: cartId, created: true });
  } catch (err) {
    console.error("Add to cart error:", err);
    return jsonError(500, "INTERNAL", "Internal server error", err);
  }
}