// app/api/cart/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
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
// GET /api/cart — fetch active cart with images
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const identity = await getIdentity(request, supabase);

    if (!identity) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    // Find active cart
    let cartQuery = supabase
      .from("carts")
      .select("id, status, share_token, share_enabled, share_name, share_message")
      .eq("status", "active")
      .single();

    cartQuery = identity.userId
      ? cartQuery.eq("user_id", identity.userId)
      : cartQuery.eq("session_id", identity.sessionId);

    const { data: cart } = await cartQuery;

    if (!cart) {
      // No cart yet — return empty state
      return jsonOk({
        id: null,
        items: [],
        item_count: 0,
        subtotal_cents: 0,
        share_token: null,
        share_enabled: false,
        share_name: null,
        share_message: null,
        share_url: null,
      });
    }

    // Fetch cart items + product + variant
    const { data: items, error: itemsError } = await supabase
      .from("cart_items")
      .select(`
        id,
        cart_id,
        product_id,
        variant_id,
        quantity,
        price_cents,
        added_note,
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
      .eq("cart_id", cart.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return jsonError(500, "ITEMS_FETCH_FAILED", "Failed to fetch cart items", itemsError);
    }

    // Fetch product images in one query
    const productIds = Array.from(
      new Set((items ?? []).map((i: any) => i.product_id).filter(Boolean))
    );

    const imagesByProductId = new Map<string, any[]>();

    if (productIds.length) {
      const { data: images } = await supabase
        .from("product_images")
        .select("id, product_id, bucket_name, object_path, alt_text, position, sort_order, is_primary")
        .in("product_id", productIds)
        .neq("is_public", false); // allow true OR null

      for (const img of images ?? []) {
        const pid = img.product_id as string;
        const arr = imagesByProductId.get(pid) ?? [];
        arr.push(img);
        imagesByProductId.set(pid, arr);
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    // Build enriched items
    const enrichedItems = (items ?? []).map((item: any) => {
      const imgs = imagesByProductId.get(item.product_id) ?? [];
      const primary = pickPrimaryImage(imgs);

      const image_url =
        primary?.bucket_name && primary?.object_path
          ? `${supabaseUrl}/storage/v1/object/public/${primary.bucket_name}/${primary.object_path}`
          : null;

      return {
        id: item.id,
        cart_id: item.cart_id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_cents: item.price_cents,
        added_note: item.added_note ?? null,

        // Flat fields the cart UI expects
        product_title: item.products?.title ?? "Unknown Product",
        product_slug: item.products?.slug ?? "",
        variant_title: item.variants?.title ?? null,
        variant_sku: item.variants?.sku ?? null,
        options: item.variants?.options ?? item.variants?.option_values ?? null,

        // Nested for components that prefer it
        product: item.products ?? null,
        variant: item.variants ?? null,

        image_url,
        image_alt: primary?.alt_text ?? null,
      };
    });

    const item_count = enrichedItems.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal_cents = enrichedItems.reduce(
      (sum, i) => sum + i.price_cents * i.quantity, 0
    );

    const share_url =
      cart.share_enabled && cart.share_token
        ? `${request.nextUrl.origin}/share/cart/${cart.share_token}`
        : null;

    return jsonOk({
      id: cart.id,
      items: enrichedItems,
      item_count,
      subtotal_cents,
      share_token: cart.share_token ?? null,
      share_enabled: cart.share_enabled ?? false,
      share_name: cart.share_name ?? null,
      share_message: cart.share_message ?? null,
      share_url,
    });
  } catch (error) {
    console.error("GET /api/cart error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/cart — clear entire cart
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const identity = await getIdentity(request, supabase);

    if (!identity) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    let cartQuery = supabase
      .from("carts")
      .select("id")
      .eq("status", "active")
      .single();

    cartQuery = identity.userId
      ? cartQuery.eq("user_id", identity.userId)
      : cartQuery.eq("session_id", identity.sessionId);

    const { data: cart } = await cartQuery;

    if (cart?.id) {
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cart.id);

      if (error) {
        return jsonError(500, "CLEAR_FAILED", "Failed to clear cart", error);
      }
    }

    return jsonOk({ cleared: true });
  } catch (error) {
    console.error("DELETE /api/cart error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}