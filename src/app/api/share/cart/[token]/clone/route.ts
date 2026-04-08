// app/api/share/cart/[token]/clone/route.ts
// POST — copies all items from a shared cart into the viewer's active cart.
// Before merging, any existing cart items are snapshotted to saved_carts
// so the user can restore them later from "recently saved" history.

import { createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// ─── Response helpers ────────────────────────────────────────────────────────

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}
function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

// ─── Identity helpers ────────────────────────────────────────────────────────

async function getIdentity(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createServerClient>>
) {
  const sessionId = req.headers.get("x-session-id");
  const { data: { user }, error } = await supabase.auth.getUser();
  const userId = !error ? (user?.id ?? null) : null;
  if (!userId && !sessionId) return null;
  return { userId, sessionId: sessionId ?? null };
}

async function getOrCreateActiveCartId(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  identity: { userId: string | null; sessionId: string | null }
): Promise<string | null> {
  const q = supabase
    .from("carts")
    .select("id")
    .eq("status", "active")
    .single();

  const query = identity.userId
    ? q.eq("user_id", identity.userId)
    : q.eq("session_id", identity.sessionId);

  const { data: existing } = await query;
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("carts")
    .insert({
      user_id: identity.userId,
      session_id: identity.sessionId,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !created?.id) return null;
  return created.id;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const supabase = await createServerClient();

    // Service role for trusted writes (saved_carts insert, image fetch)
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 1. Identify the viewer ─────────────────────────────────────────────
    const identity = await getIdentity(request, supabase);
    if (!identity) {
      return jsonError(400, "NO_IDENTITY", "No user or session identified");
    }

    // ── 2. Load the shared cart ────────────────────────────────────────────
    const { data: sharedCart, error: cartError } = await supabase
      .from("carts")
      .select(`
        id,
        share_name,
        share_enabled,
        share_expires_at,
        cart_items (
          id,
          variant_id,
          product_id,
          quantity,
          price_cents,
          added_note,
          products ( title, slug ),
          product_variants ( title, options )
        )
      `)
      .eq("share_token", token)
      .eq("share_enabled", true)
      .single();

    if (cartError || !sharedCart) {
      return jsonError(404, "NOT_FOUND", "Shared cart not found");
    }
    if (sharedCart.share_expires_at && new Date(sharedCart.share_expires_at) < new Date()) {
      return jsonError(410, "EXPIRED", "This share link has expired");
    }

    const sharedItems: any[] = sharedCart.cart_items ?? [];
    if (sharedItems.length === 0) {
      return jsonOk({ cloned: 0, saved: false, message: "Nothing to add — the wishlist is empty." });
    }

    // ── 3. Get or create the viewer's cart ─────────────────────────────────
    const viewerCartId = await getOrCreateActiveCartId(supabase, identity);
    if (!viewerCartId) {
      return jsonError(500, "CART_CREATE_FAILED", "Could not create your cart");
    }

    // ── 4. Fetch viewer's existing items ───────────────────────────────────
    const { data: existingItems, error: existingError } = await supabase
      .from("cart_items")
      .select(`
        id,
        variant_id,
        product_id,
        quantity,
        price_cents,
        added_note,
        products ( title, slug ),
        product_variants ( title, options )
      `)
      .eq("cart_id", viewerCartId);

    // ── 5. Snapshot existing items into saved_carts BEFORE any merge ───────
    // Nothing is ever lost — even if the user had 0 items, we skip gracefully.
    let savedCartId: string | null = null;

    if (!existingError && existingItems && existingItems.length > 0) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

      // Fetch primary images for existing cart products in one query
      const productIds = [...new Set(existingItems.map((i: any) => i.product_id).filter(Boolean))];
      const { data: images } = await adminClient
        .from("product_images")
        .select("product_id, bucket_name, object_path, is_primary, sort_order, position")
        .in("product_id", productIds)
        .neq("is_public", false);

      const imageMap = new Map<string, string>();
      const grouped = new Map<string, any[]>();
      for (const img of images ?? []) {
        const arr = grouped.get(img.product_id) ?? [];
        arr.push(img);
        grouped.set(img.product_id, arr);
      }
      for (const [pid, imgs] of grouped) {
        const sorted = [...imgs].sort((a, b) => {
          if (b.is_primary && !a.is_primary) return 1;
          if (a.is_primary && !b.is_primary) return -1;
          return (a.sort_order ?? a.position ?? 999) - (b.sort_order ?? b.position ?? 999);
        });
        const best = sorted[0];
        if (best?.bucket_name && best?.object_path) {
          imageMap.set(pid, `${supabaseUrl}/storage/v1/object/public/${best.bucket_name}/${best.object_path}`);
        }
      }

      // Rich JSONB snapshot — preserves everything needed to show & restore the items
      const snapshotItems = existingItems.map((item: any) => ({
        variant_id:    item.variant_id,
        product_id:    item.product_id,
        product_title: item.products?.title ?? "Unknown Product",
        product_slug:  item.products?.slug ?? "",
        variant_title: item.product_variants?.title ?? null,
        options:       item.product_variants?.options ?? null,
        quantity:      item.quantity,
        price_cents:   item.price_cents,
        added_note:    item.added_note ?? null,
        image_url:     imageMap.get(item.product_id) ?? null,
      }));

      const snapshotCount = snapshotItems.reduce((s: number, i: any) => s + i.quantity, 0);
      const snapshotSubtotal = snapshotItems.reduce(
        (s: number, i: any) => s + i.price_cents * i.quantity, 0
      );

      const { data: savedCart, error: saveError } = await adminClient
        .from("saved_carts")
        .insert({
          user_id:            identity.userId,
          session_id:         identity.sessionId,
          trigger:            "clone",
          source_share_token: token,
          source_share_name:  sharedCart.share_name ?? null,
          source_cart_id:     sharedCart.id,
          label:              `Your cart before adding "${sharedCart.share_name ?? "a wishlist"}"`,
          items:              snapshotItems,
          item_count:         snapshotCount,
          subtotal_cents:     snapshotSubtotal,
        })
        .select("id")
        .single();

      if (saveError) {
        // Non-fatal — log and continue. The clone should still succeed.
        console.error("Failed to snapshot cart to saved_carts:", saveError);
      } else {
        savedCartId = savedCart?.id ?? null;
      }
    }

    // ── 6. Build variant lookup for existing items (for merge) ─────────────
    const existingByVariant = new Map<string, { id: string; quantity: number }>();
    for (const item of existingItems ?? []) {
      existingByVariant.set(item.variant_id, { id: item.id, quantity: item.quantity });
    }

    // ── 7. Validate shared variants are still active + in stock ───────────
    const variantIds = sharedItems.map((i: any) => i.variant_id).filter(Boolean);

    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, is_active, price_cents, inventory_qty, track_inventory, allow_backorder")
      .in("id", variantIds)
      .eq("is_active", true);

    const validVariants = new Map<string, any>();
    for (const v of variants ?? []) validVariants.set(v.id, v);

    // ── 8. Build insert / update lists ────────────────────────────────────
    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; quantity: number }> = [];
    let skipped = 0;

    for (const item of sharedItems) {
      const variant = validVariants.get(item.variant_id);
      if (!variant) { skipped++; continue; }

      const outOfStock =
        variant.track_inventory &&
        !variant.allow_backorder &&
        (variant.inventory_qty ?? 0) < 1;
      if (outOfStock) { skipped++; continue; }

      const existing = existingByVariant.get(item.variant_id);
      if (existing) {
        toUpdate.push({ id: existing.id, quantity: Math.min(99, existing.quantity + item.quantity) });
      } else {
        toInsert.push({
          cart_id:     viewerCartId,
          variant_id:  item.variant_id,
          product_id:  item.product_id,
          quantity:    Math.min(99, item.quantity),
          price_cents: variant.price_cents ?? item.price_cents, // live price snapshot
          added_note:  item.added_note ?? null,
        });
      }
    }

    // ── 9. Execute DB writes ───────────────────────────────────────────────
    const errors: string[] = [];

    if (toInsert.length > 0) {
      const { error } = await supabase.from("cart_items").insert(toInsert);
      if (error) {
        console.error("Clone insert error:", error);
        errors.push("Some items could not be added.");
      }
    }

    for (const upd of toUpdate) {
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity: upd.quantity })
        .eq("id", upd.id);
      if (error) {
        console.error("Clone update error:", error);
        errors.push("Some quantities could not be updated.");
      }
    }

    // ── 10. Track in shared_cart_views (fire & forget) ────────────────────
    const viewerSessionId = request.headers.get("x-session-id") ?? `anon_${Date.now()}`;
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;

    adminClient
      .from("shared_cart_views")
      .insert({
        cart_id:           sharedCart.id,
        viewer_user_id:    identity.userId ?? null,
        viewer_session_id: viewerSessionId,
        cloned:            true,
        referrer:          request.headers.get("referer") ?? null,
        user_agent:        request.headers.get("user-agent") ?? null,
      })
      .then(() => {})
      .catch((e: any) => console.error("Failed to track shared_cart_view:", e));

    const cloned = toInsert.length + toUpdate.length;

    return jsonOk({
      cloned,
      skipped,
      saved_cart_id:   savedCartId,
      snapshot_saved:  savedCartId !== null,
      warnings:        errors.length > 0 ? errors : undefined,
      message:
        cloned > 0
          ? `${cloned} item${cloned !== 1 ? "s" : ""} added to your cart!`
          : "No new items were added.",
    });

  } catch (err) {
    console.error("Clone shared cart error:", err);
    return jsonError(500, "INTERNAL", "Internal server error", err);
  }
}