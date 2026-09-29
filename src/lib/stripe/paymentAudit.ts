import Stripe from "stripe";
import type { CommerceStripeMode, PaymentLane } from "./commerce";

type StripePaymentObject = Stripe.PaymentIntent | Stripe.Charge;

function validLane(value: string | undefined): PaymentLane | null {
  return value === "shop" || value === "labs" || value === "pos" || value === "tank"
    ? value
    : null;
}

export function paymentEventIdentity(event: Stripe.Event, mode: CommerceStripeMode) {
  const object = event.data.object as StripePaymentObject;
  const metadata = object.metadata ?? {};
  const lane = validLane(metadata.payment_lane)
    ?? (metadata.tank_purchase_id ? "tank" : null)
    ?? (metadata.order_source === "pos" ? "pos" : null);
  if (!lane) return null;

  const amount = "amount" in object
    ? object.amount
    : "amount_received" in object
      ? object.amount_received
      : null;

  return {
    stripe_event_id: event.id,
    stripe_object_id: object.id,
    stripe_event_type: event.type,
    lane,
    mode,
    amount_cents: typeof amount === "number" ? amount : null,
    currency: typeof object.currency === "string" ? object.currency.toLowerCase() : null,
    order_id: metadata.order_id || null,
    tank_purchase_id: metadata.tank_purchase_id || null,
    product_key: metadata.product_key || null,
  };
}

export async function beginPaymentAudit(supabase: any, event: Stripe.Event, mode: CommerceStripeMode) {
  const identity = paymentEventIdentity(event, mode);
  if (!identity) return null;

  // The RPC increments delivery attempts atomically on Stripe retries.
  const { error } = await supabase.rpc("begin_payment_lane_event", {
    p_stripe_event_id: identity.stripe_event_id,
    p_stripe_object_id: identity.stripe_object_id,
    p_stripe_event_type: identity.stripe_event_type,
    p_lane: identity.lane,
    p_mode: identity.mode,
    p_amount_cents: identity.amount_cents,
    p_currency: identity.currency,
    p_order_id: identity.order_id,
    p_tank_purchase_id: identity.tank_purchase_id,
    p_product_key: identity.product_key,
  });

  if (error) {
    // The ledger must not block an otherwise valid payment webhook. This also
    // keeps deploy ordering safe while the migration is being applied.
    console.error("[Payment Audit] Could not begin event ledger entry:", error.message);
    return null;
  }
  return identity;
}

async function orderSummary(supabase: any, orderId: string) {
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_source, payment_status, status, subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents, currency")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("variant_id, research_variant_id, quantity, price_cents, currency")
      .eq("order_id", orderId),
  ]);
  return {
    order,
    items: items ?? [],
    inventory_policy: order?.order_source === "pos" ? "immediate" : "on_fulfillment",
  };
}

async function tankSummary(supabase: any, purchaseId: string) {
  const { data: purchase } = await supabase
    .from("tank_purchases")
    .select("id, product_key, amount_cents, status, fulfilled_at")
    .eq("id", purchaseId)
    .maybeSingle();
  return {
    purchase,
    entitlement_policy: "exactly_once",
  };
}

export async function finishPaymentAudit(
  supabase: any,
  identity: NonNullable<ReturnType<typeof paymentEventIdentity>> | null,
  error?: unknown,
) {
  if (!identity) return;
  const summary = identity.order_id
    ? await orderSummary(supabase, identity.order_id)
    : identity.tank_purchase_id
      ? await tankSummary(supabase, identity.tank_purchase_id)
      : {};

  const fulfillmentStatus = identity.order_id
    ? ((summary as any).order?.payment_status ?? "unknown")
    : identity.tank_purchase_id
      ? ((summary as any).purchase?.fulfilled_at ? "fulfilled" : (summary as any).purchase?.status ?? "unknown")
      : "not_applicable";

  const { error: updateError } = await supabase.from("payment_lane_events").update({
    processing_status: error ? "failed" : "processed",
    fulfillment_status: error ? "failed" : fulfillmentStatus,
    internal_summary: summary,
    error_message: error ? String(error instanceof Error ? error.message : error).slice(0, 500) : null,
    processed_at: error ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("stripe_event_id", identity.stripe_event_id);

  if (updateError) console.error("[Payment Audit] Could not finish event ledger entry:", updateError.message);
}
