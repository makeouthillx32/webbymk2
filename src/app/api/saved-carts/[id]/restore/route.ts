// app/api/saved-carts/[id]/restore/route.ts
// POST — restores a saved cart snapshot by re-adding its items to the active cart.
// Before restoring, the current cart is itself snapshotted (trigger='manual')
// so nothing is ever permanently lost.

import { createServerClient } from "@/utils/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}
function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

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
  const q = supabase.from("carts").select("id").eq("status", "active").single();
  const query = identity.userId
    ? q.eq("user_id", identity.userId)
    : q.eq("session_id", identity.sessionId);
  const { data: existing } = await query;
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("carts")
    .insert({ user_id: identity.userId, session_id: identity.sessionId, status: "active" })
    .select("id")
    .single();
  return error || !created?.id ? null : created.id;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: savedCartId } = await params;
    const supabase = await createServerClient();
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 1. Identify viewer ─────────────────────────────────────────────────
    const identity = await getIdentity(request, supabase);
    if (!identity) return jsonError(400, "NO_IDENTITY", "No user or session identified");

    // ── 2. Load the saved cart snapshot ───────────────────────────────────
    let savedQuery = supabase
      .from("saved_carts")
      .select("id, label, items, item_count, subtotal_cents")
      .eq("id", savedCartId)
      .is("deleted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    savedQuery = identity.userId
      ? savedQuery.eq("user_id", identity.userId)
      : savedQuery.eq("session_id", identity.sessionId!);

    const { data: savedCart, error: savedError } = await savedQuery;
    if (savedError || !savedCart) {
      return jsonError(404, "NOT_FOUND", "Saved cart not found or expired");
    }

    const snapshotItems: any[] = savedCart.items ?? [];
    if (snapshotItems.length === 0) {
      return jsonOk({ restored: 0, message: "This saved cart is empty." });
    }

    // ── 3. Get or create active cart ───────────────────────────────────────
    const viewerCartId = await getOrCreateActiveCartId(supabase, identity);
    if (!viewerCartId) return jsonError(500, "CART_CREATE_FAILED", "Could not create your cart");

    // ── 4. Snapshot current cart before restore ────────────────────────────
    const { data: currentItems } = await supabase
      .from("cart_items")
      .select("id, variant_id, product_id, quantity, price_cents, added_note, products(title,slug), product_variants(title,options)")
      .eq("cart_id", viewerCartId);

    if (currentItems && currentItems.length > 0) {
      const currentSnapshot = currentItems.map((item: any) => ({
        variant_id:    item.variant_id,
        product_id:    item.product_id,
        product_title: item.products?.title ?? "Unknown Product",
        product_slug:  item.products?.slug ?? "",
        variant_title: item.product_variants?.title ?? null,
        options:       item.product_variants?.options ?? null,
        quantity:      item.quantity,
        price_cents:   item.price_cents,
        added_note:    item.added_note ?? null,
        image_url:     null, // skipped for speed on restore-of-restore
      }));

      const count = currentSnapshot.reduce((s: number, i: any) => s + i.quantity, 0);
      const subtotal = currentSnapshot.reduce((s: number, i: any) => s + i.price_cents * i.quantity, 0);

      adminClient.from("saved_carts").insert({
        user_id:       identity.userId,
        session_id:    identity.sessionId,
        trigger:       "manual",
        label:         `Your cart before restoring "${savedCart.label ?? "a saved cart"}"`,
        items:         currentSnapshot,
        item_count:    count,
        subtotal_cents: subtotal,
      }).then(() => {}).catch((e: any) => console.error("Pre-restore snapshot failed:", e));
    }

    // ── 5. Validate restored variants are still available ─────────────────
    const variantIds = snapshotItems.map((i: any) => i.variant_id).filter(Boolean);

    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, is_active, price_cents, inventory_qty, track_inventory, allow_backorder")
      .in("id", variantIds)
      .eq("is_active", true);

    const validVariants = new Map<string, any>();
    for (const v of variants ?? []) validVariants.set(v.id, v);

    // Existing cart items for merge
    const existingByVariant = new Map<string, { id: string; quantity: number }>();
    for (const item of currentItems ?? []) {
      existingByVariant.set(item.variant_id, { id: item.id, quantity: item.quantity });
    }

    // ── 6. Build upsert lists ─────────────────────────────────────────────
    const toInsert: any[] = [];
    const toUpdate: Array<{ id: string; quantity: number }> = [];
    let skipped = 0;

    for (const item of snapshotItems) {
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
          cart_id:    viewerCartId,
          variant_id: item.variant_id,
          product_id: item.product_id,
          quantity:   Math.min(99, item.quantity),
          price_cents: variant.price_cents, // use live price
          added_note: item.added_note ?? null,
        });
      }
    }

    // ── 7. Execute writes ─────────────────────────────────────────────────
    const errors: string[] = [];
    if (toInsert.length > 0) {
      const { error } = await supabase.from("cart_items").insert(toInsert);
      if (error) errors.push("Some items could not be restored.");
    }
    for (const upd of toUpdate) {
      const { error } = await supabase.from("cart_items").update({ quantity: upd.quantity }).eq("id", upd.id);
      if (error) errors.push("Some quantities could not be updated.");
    }

    // ── 8. Soft-delete the restored saved cart (it's been consumed) ────────
    await adminClient
      .from("saved_carts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", savedCartId);

    const restored = toInsert.length + toUpdate.length;

    return jsonOk({
      restored,
      skipped,
      warnings: errors.length > 0 ? errors : undefined,
      message: restored > 0
        ? `${restored} item${restored !== 1 ? "s" : ""} restored to your cart!`
        : "No items could be restored.",
    });

  } catch (err) {
    console.error("Restore saved cart error:", err);
    return jsonError(500, "INTERNAL", "Internal server error", err);
  }
}