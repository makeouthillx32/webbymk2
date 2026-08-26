// app/api/research-cart/route.ts
//
// Research cart is auth-only — no guest/session_id fallback (matches the
// "sign in before you go into cart" requirement for research checkout).
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Note: GET/DELETE here are view/clear-own-cart only — no purchase happens,
// so they stay open to any signed-in user. The researcher-role gate lives
// on the write paths that actually add items or create an order: see
// requireResearcherRole() in items/route.ts and research-checkout's
// create-payment-intent route.

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

// ─────────────────────────────────────────────
// GET /api/research-cart — fetch active research cart
// ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await createServerClient();
    const supabase = createAdminClient();
    const userId = await getUserId(auth);

    if (!userId) {
      return jsonError(401, "AUTH_REQUIRED", "Sign in to view your research cart");
    }

    const { data: cart } = await supabase
      .from("research_carts")
      .select("id, status")
      .eq("status", "active")
      .eq("user_id", userId)
      .single();

    if (!cart) {
      return jsonOk({ id: null, items: [], item_count: 0, subtotal_cents: 0 });
    }

    const { data: items, error: itemsError } = await supabase
      .from("research_cart_items")
      .select(
        "id, cart_id, research_product_id, research_variant_id, quantity, price_cents, product_title, variant_title, dosage_label, image_url, created_at"
      )
      .eq("cart_id", cart.id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return jsonError(500, "ITEMS_FETCH_FAILED", "Failed to fetch research cart items", itemsError);
    }

    const enrichedItems = (items ?? []).map((item: any) => ({
      ...item,
      product_id: item.research_product_id,
      variant_id: item.research_variant_id,
    }));

    const item_count = enrichedItems.reduce((sum: number, i: any) => sum + i.quantity, 0);
    const subtotal_cents = enrichedItems.reduce(
      (sum: number, i: any) => sum + i.price_cents * i.quantity,
      0
    );

    return jsonOk({
      id: cart.id,
      items: enrichedItems,
      item_count,
      subtotal_cents,
    });
  } catch (error) {
    console.error("GET /api/research-cart error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}

// ─────────────────────────────────────────────
// DELETE /api/research-cart — clear entire cart
// ─────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const auth = await createServerClient();
    const supabase = createAdminClient();
    const userId = await getUserId(auth);

    if (!userId) {
      return jsonError(401, "AUTH_REQUIRED", "Sign in to manage your research cart");
    }

    const { data: cart } = await supabase
      .from("research_carts")
      .select("id")
      .eq("status", "active")
      .eq("user_id", userId)
      .single();

    if (cart?.id) {
      const { error } = await supabase
        .from("research_cart_items")
        .delete()
        .eq("cart_id", cart.id);

      if (error) {
        return jsonError(500, "CLEAR_FAILED", "Failed to clear research cart", error);
      }
    }

    return jsonOk({ cleared: true });
  } catch (error) {
    console.error("DELETE /api/research-cart error:", error);
    return jsonError(500, "INTERNAL", "Internal server error", error);
  }
}
