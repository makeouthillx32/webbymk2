// src/lib/research/closeResearchCart.ts
//
// A paid (or submitted-for-Zelle) Labs order used to leave its research cart
// 'active' — and, on the card path, with its items still in it — so the same
// cart could be checked out again. Found in the 2026-09-24 Labs end-to-end
// test. Closing = clear the items and mark the cart 'converted'. The cart
// API already creates a fresh 'active' cart the next time the user adds
// something (api/research-cart/items), and GET returns an empty cart when
// none is active, so a closed cart never strands a customer.
//
// Pass a service-role client (the cart API does the same for these tables)
// and the owning user's id: cart_id arrives from the browser at checkout, so
// the cart is only touched when it actually belongs to that user.
//
// Idempotent: Stripe redelivers webhooks, and both checkout paths call this.
import type { SupabaseClient } from "@supabase/supabase-js";

export async function closeResearchCart(
  admin: SupabaseClient,
  cartId: string | null | undefined,
  ownerId: string | null | undefined,
) {
  if (!cartId || !ownerId) return;

  const { data: cart } = await admin
    .from("research_carts")
    .select("id")
    .eq("id", cartId)
    .eq("user_id", ownerId)
    .maybeSingle();

  if (!cart) {
    console.warn(`[research-cart] cart ${cartId} not found for user ${ownerId} — nothing to close`);
    return;
  }

  const { error: itemsError } = await admin.from("research_cart_items").delete().eq("cart_id", cartId);
  if (itemsError) console.error(`[research-cart] failed to clear items for ${cartId}:`, itemsError.message);

  const { error: cartError } = await admin
    .from("research_carts")
    .update({ status: "converted", updated_at: new Date().toISOString() })
    .eq("id", cartId);
  if (cartError) console.error(`[research-cart] failed to close cart ${cartId}:`, cartError.message);
}
