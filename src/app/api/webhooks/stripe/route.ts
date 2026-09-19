// app/api/webhooks/stripe/route.ts
import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { constructCommerceWebhookEvent } from "@/lib/stripe/commerce";
import { sendNotification } from "@/lib/notifications";
import { sendOrderConfirmationEmail } from "@/lib/mail/sendOrderConfirmation";
import { beginPaymentAudit, finishPaymentAudit } from "@/lib/stripe/paymentAudit";
import {
  recordChargeFinancials,
  recordPaymentIntentFinancials,
  recordRefundFinancials,
} from "@/lib/stripe/financialLedger";
import type { SeasonPassTier } from "@/zones/tank/seasonPass";
import { TANK_PRODUCTS, type TankProductKey } from "@/zones/tank/tankProducts";
import {
  isEntitledSubscriptionStatus,
  isTerminalSubscriptionStatus,
  latestSubscriptionPeriodEnd,
  resolveTankSubscriptionProduct,
} from "@/zones/tank/server/tankSubscriptionPolicy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    let stripe: Stripe;
    let mode: "test" | "live";
    try {
      const verified = constructCommerceWebhookEvent(body, signature);
      event = verified.event;
      stripe = verified.stripe;
      mode = verified.mode;
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Create Supabase client (service role for webhook operations)
    const supabase = createAdminClient();
    const audit = await beginPaymentAudit(supabase, event, mode);

    try {
      // Handle different event types
      switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(supabase, stripe, paymentIntent, mode);
        await recordPaymentIntentFinancials(supabase, stripe, paymentIntent, mode);
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(supabase, paymentIntent);
        break;
      }

      case 'payment_intent.requires_action': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handleRequiresAction(supabase, paymentIntent);
        break;
      }

      case 'charge.succeeded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeSucceeded(supabase, charge);
        await recordChargeFinancials(supabase, stripe, charge.id, mode);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(supabase, charge);
        await recordRefundFinancials(supabase, stripe, charge, mode);
        break;
      }

      case 'checkout.session.completed': {
        await handleTankCheckoutCompleted(
          supabase,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      }

      case 'checkout.session.expired': {
        await handleTankCheckoutExpired(
          supabase,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      }

      case 'invoice.paid': {
        await handleTankInvoicePaid(
          supabase,
          stripe,
          event.data.object as Stripe.Invoice,
        );
        break;
      }

      case 'invoice.payment_failed': {
        await handleTankInvoicePaymentFailed(
          supabase,
          stripe,
          event.data.object as Stripe.Invoice,
        );
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncTankSubscriptionLifecycle(
          supabase,
          event.data.object as Stripe.Subscription,
        );
        break;
      }

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
      await finishPaymentAudit(supabase, audit);
    } catch (handlerError) {
      await finishPaymentAudit(supabase, audit, handlerError);
      throw handlerError;
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed', details: error.message },
      { status: 500 }
    );
  }
}

// Handle successful payment
async function handlePaymentSucceeded(
  supabase: any,
  stripe: Stripe,
  paymentIntent: Stripe.PaymentIntent,
  mode: "test" | "live",
) {
  // Tank store purchases (season pass / token packs / room-upgrade bones)
  // carry tank_purchase_id instead of order_id — a season pass isn't a
  // shipped order and doesn't belong in the orders/order_items schema.
  // Branch before the order_id check below so this doesn't log a spurious
  // "No order_id" error for every Tank purchase.
  if (paymentIntent.metadata.tank_purchase_id) {
    await handleTankPurchaseSucceeded(supabase, paymentIntent);
    return;
  }

  const orderId = paymentIntent.metadata.order_id;

  if (!orderId) {
    console.error('No order_id in payment intent metadata');
    return;
  }

  // ── POS orders are fulfilled immediately; web orders go to processing ──
  const isPOS = paymentIntent.metadata.order_source === 'pos';
  const newStatus = isPOS ? 'fulfilled' : 'processing';

  // Get payment method details
  let paymentMethodDetails: any = {};
  if (paymentIntent.payment_method) {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(
        paymentIntent.payment_method as string
      );
      
      if (paymentMethod.card) {
        paymentMethodDetails = {
          payment_method_id: paymentMethod.id,
          payment_method_brand: paymentMethod.card.brand,
          payment_method_last4: paymentMethod.card.last4,
          payment_method_exp_month: paymentMethod.card.exp_month,
          payment_method_exp_year: paymentMethod.card.exp_year,
        };
      }
    } catch (err) {
      console.error('Failed to retrieve payment method:', err);
    }
  }

  // Update order — also select promo_code for usage tracking below.
  // Stripe redelivers webhook events (retries, and occasionally genuine
  // concurrent duplicate deliveries) — payment_intent.succeeded is not
  // guaranteed to fire exactly once. The order UPDATE itself is safe to run
  // twice (it just sets fixed values), but the side effects below
  // (confirmation email, admin notification) are NOT naturally idempotent —
  // confirm_discount_reservation/credit_creator_commission already guard
  // themselves, but nothing stopped sendOrderConfirmationEmail from firing
  // twice. Fixed 2026-08-10 by only transitioning FROM 'pending': a second
  // delivery for an already-paid order matches zero rows here, and every
  // side effect below is skipped.
  const { data: order, error } = await supabase
    .from('orders')
    .update({
      payment_status: 'paid',
      status: newStatus,
      payment_succeeded_at: new Date().toISOString(),
      checkout_step: 'complete',
      stripe_mode: mode,
      ...paymentMethodDetails,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('payment_status', 'pending')
    .select('order_number, total_cents, discount_cents, email, customer_first_name, customer_last_name, promo_code, order_source, discount_reservation_id')
    .maybeSingle();

  if (error) {
    console.error('Failed to update order on payment success:', error);
    return;
  }

  if (!order) {
    console.log(`Order ${orderId} already processed (duplicate webhook delivery) — skipping side effects`);
    return;
  }

  console.log(`Order ${orderId} marked as paid + ${newStatus}${isPOS ? ' (POS — auto-fulfilled)' : ''}`);

  // ── Confirm promo code usage (web orders only — POS has no promos) ─────
  // discount_reservation_id is set when the code had a max_uses cap —
  // reserve_discount_use already took an atomic hold on it at checkout time
  // (see create-payment-intent), so this just turns that hold into a
  // permanent counted use. Codes with no cap never got a reservation
  // (nothing to race over), so they still fall back to the old direct
  // increment — see reserve_discount_use / migration
  // discount_usage_reservations for the full race-condition writeup.
  if (order?.promo_code) {
    try {
      if (order.discount_reservation_id) {
        await supabase.rpc('confirm_discount_reservation', { p_reservation_id: order.discount_reservation_id });
        console.log(`[Promo] ✅ Confirmed reservation for code: ${order.promo_code}`);
      } else {
        await supabase.rpc('increment_discount_uses', { p_code: order.promo_code });
        console.log(`[Promo] ✅ Incremented uses_count for code: ${order.promo_code}`);
      }
    } catch (promoErr) {
      // Non-fatal — order is paid, don't throw
      console.error('[Promo] ⚠️ Failed to confirm/increment promo usage:', promoErr);
    }

    // ── Creator affiliate program: credit commission if this code belongs
    //    to a creator. No-op (returns void, does nothing) for ordinary promo
    //    codes that aren't linked to a creator. ──
    try {
      await supabase.rpc('credit_creator_commission', {
        p_order_id: orderId,
        p_promo_code: order.promo_code,
        p_discount_cents: order.discount_cents,
        p_order_number: order.order_number != null ? String(order.order_number) : null,
      });
      console.log(`[Creator] ✅ Commission credit checked for code: ${order.promo_code}`);
    } catch (creatorErr) {
      // Non-fatal — order is paid, don't throw
      console.error('[Creator] ⚠️ Failed to credit creator commission:', creatorErr);
    }
  }

  // ── Customer receipt (skip for POS — those are in-person sales) ────
  if (!isPOS) {
    try {
      const result = await sendOrderConfirmationEmail(orderId);
      console.log(
        result.sent
          ? `[Mail] ✅ Order confirmation sent for ${order?.order_number ?? orderId}`
          : `[Mail] ⚠️ Order confirmation not sent: ${result.reason}`
      );
    } catch (mailErr) {
      // Non-fatal — order is paid, don't throw
      console.error('[Mail] ⚠️ Failed to send order confirmation:', mailErr);
    }
  }

  // ── Notification ──────────────────────────────────────────────
  try {
    const total = order ? `$${(order.total_cents / 100).toFixed(2)}` : '';
    const orderNum = order?.order_number ?? orderId;

    const title = isPOS
      ? `POS sale ${orderNum}`
      : `New order ${orderNum}`;

    const customerName = isPOS
      ? [order?.customer_first_name, order?.customer_last_name].filter(Boolean).join(' ') || 'Walk-in'
      : [order?.customer_first_name, order?.customer_last_name].filter(Boolean).join(' ') || order?.email || 'Guest';

    const subtitle = isPOS
      ? `${total} — in-person, fulfilled`
      : `${customerName} — ${total}`;

    await sendNotification({
      title,
      subtitle,
      actionUrl: `/dashboard/orders`,
      role_admin: true,
    });

    console.log(`[Notifications] ✅ Notification sent for ${orderNum}`);
  } catch (notifErr) {
    // Non-fatal — order is already marked paid, don't throw
    console.error('[Notifications] ⚠️ Failed to send new order notification:', notifErr);
  }
}

// Tank store fulfillment — token packs credit the ledger (a trigger moves
// tank_profiles.tokens), season pass flips season_pass_active, and room_vip
// is deliberately a placeholder (no real room-tier gating exists yet) that
// still proves the purchase -> fulfillment path end to end.
//
// Fulfillment happens BEFORE the row is marked paid, and errors are rethrown
// so Stripe retries. See the note inside for why the reverse order is unsafe
// once real money is involved.
async function handleTankPurchaseSucceeded(supabase: any, paymentIntent: Stripe.PaymentIntent) {
  const purchaseId = paymentIntent.metadata.tank_purchase_id;
  const productKey = paymentIntent.metadata.product_key;
  const userId = paymentIntent.metadata.user_id;

  if (!purchaseId || !productKey || !userId) {
    console.error('[Tank Store] Missing metadata on payment intent', paymentIntent.id);
    return;
  }

  const { data: purchase, error } = await supabase
    .from('tank_purchases')
    .select('id, status')
    .eq('id', purchaseId)
    .maybeSingle();

  if (error) {
    console.error('[Tank Store] Failed to load purchase:', error);
    throw error;
  }
  if (!purchase) {
    console.error(`[Tank Store] Purchase ${purchaseId} not found`);
    return;
  }
  if (purchase.status === 'paid') {
    console.log(`[Tank Store] Purchase ${purchaseId} already fulfilled — skipping`);
    return;
  }

  // FULFIL FIRST, MARK PAID SECOND.
  //
  // The previous order marked the row paid up front and swallowed any
  // fulfillment error as "non-fatal". That is survivable with test money and
  // not with real money: a single failed grant left the customer charged, the
  // purchase marked paid, and no way back -- we return 200, so Stripe never
  // retries, and the status guard means a manual replay matches zero rows.
  // That is exactly how the partial-index bug silently ate a token grant.
  //
  // Both writes below are idempotent (unique purchase_id / user_id), so a
  // Stripe retry re-runs them harmlessly. Throwing therefore costs nothing and
  // buys us Stripe's retry schedule as a safety net.
  if (productKey.startsWith('tokens_')) {
    const product = TANK_PRODUCTS[productKey as TankProductKey];
    const grant = product?.tokens ?? 0;
    if (grant <= 0) {
      // Refuse rather than silently grant nothing on an unknown pack.
      throw new Error(`Unknown token product ${productKey} on purchase ${purchaseId}`);
    }
    const { error: tokenError } = await supabase
      .from('tank_token_transactions')
      .upsert({
        user_id: userId,
        amount: grant,
        reason: `stripe_purchase:${productKey}`,
        purchase_id: purchaseId,
      }, { onConflict: 'purchase_id', ignoreDuplicates: true });
    if (tokenError) throw tokenError;
    console.log(`[Tank Store] Granted ${grant} tokens to ${userId} (purchase ${purchaseId})`);
  } else if (productKey === 'season_pass') {
    const { error: passError } = await supabase
      .from('tank_profiles')
      .upsert(
        { user_id: userId, season_pass_active: true, season_pass_purchased_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    if (passError) throw passError;
    console.log(`[Tank Store] Activated season pass for ${userId} (purchase ${purchaseId})`);
  } else if (TANK_PRODUCTS[productKey as TankProductKey]?.irlFulfilment) {
    // A real-world booking. Nothing here can deliver a week in the house, so
    // the money is recorded and fulfilled_at is deliberately left null until a
    // human has actually arranged it. Marking it delivered on payment would
    // hide an unhonoured $2,500 booking behind a green row.
    console.log(
      `[Tank Store] IRL booking ${productKey} paid (purchase ${purchaseId}) — AWAITING STAFF, not fulfilled`,
    );
  } else if (productKey === 'room_vip') {
    // Bones only — no room-tier gating exists yet to actually grant.
    console.log(`[Tank Store] room_vip purchase ${purchaseId} paid — no gating wired yet, purchase recorded only`);
  }

  const { error: paidError } = await supabase
    .from('tank_purchases')
    .update({
      status: 'paid',
      // Only things the system actually delivered get a fulfilment time.
      ...(TANK_PRODUCTS[productKey as TankProductKey]?.irlFulfilment
        ? {}
        : { fulfilled_at: new Date().toISOString() }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseId)
    .eq('status', 'pending');
  if (paidError) {
    console.error('[Tank Store] Fulfilled but failed to mark paid:', paidError);
    throw paidError;
  }
}

type TankSubscriptionIdentity = {
  userId: string;
  purchaseId: string;
  productKey: "season_pass" | "season_pass_xl";
  tier: SeasonPassTier;
};

function tankSubscriptionIdentity(
  metadata: Stripe.Metadata | null | undefined,
): TankSubscriptionIdentity | null {
  if (metadata?.payment_lane !== "tank") return null;
  const productKey = metadata.product_key;
  const userId = metadata.user_id;
  const purchaseId = metadata.tank_purchase_id;
  const product = resolveTankSubscriptionProduct(productKey);
  if (!product || !userId || !purchaseId) {
    return null;
  }
  return {
    userId,
    purchaseId,
    productKey: product.productKey,
    tier: product.tier,
  };
}

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

function subscriptionFromInvoice(invoice: Stripe.Invoice): string | null {
  const legacyInvoice = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  return stripeId(
    invoice.parent?.subscription_details?.subscription ??
      legacyInvoice.subscription ??
      null,
  );
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  return latestSubscriptionPeriodEnd(
    subscription.items.data.map((item) => item.current_period_end),
  );
}

async function handleTankCheckoutCompleted(
  supabase: any,
  session: Stripe.Checkout.Session,
) {
  const identity = tankSubscriptionIdentity(session.metadata);
  if (!identity || session.mode !== "subscription") return;

  const subscriptionId = stripeId(session.subscription);
  const customerId = stripeId(session.customer);
  await supabase
    .from("tank_purchases")
    .update({
      stripe_checkout_session_id: session.id,
      stripe_subscription_id: subscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", identity.purchaseId)
    .eq("user_id", identity.userId);

  await supabase
    .from("tank_profiles")
    .upsert(
      {
        user_id: identity.userId,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
        ...(customerId ? { stripe_customer_mode: session.livemode ? "live" : "test" } : {}),
        ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        season_pass_tier: identity.tier,
      },
      { onConflict: "user_id" },
    );
}

async function handleTankCheckoutExpired(
  supabase: any,
  session: Stripe.Checkout.Session,
) {
  const identity = tankSubscriptionIdentity(session.metadata);
  if (!identity || session.mode !== "subscription") return;
  await supabase
    .from("tank_purchases")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", identity.purchaseId)
    .eq("status", "pending");
}

async function syncTankSubscription(
  supabase: any,
  subscription: Stripe.Subscription,
  activateFromPaidInvoice: boolean,
) {
  const identity = tankSubscriptionIdentity(subscription.metadata);
  if (!identity) return null;

  const active = isEntitledSubscriptionStatus(subscription.status);
  const profile: Record<string, unknown> = {
    user_id: identity.userId,
    stripe_customer_id: stripeId(subscription.customer),
    // Record which mode this cus_ belongs to. Without it, checkout cannot
    // tell a test customer from a live one and hands the wrong id to Stripe.
    stripe_customer_mode: subscription.livemode ? "live" : "test",
    stripe_subscription_id: subscription.id,
    season_pass_tier: identity.tier,
    season_pass_status: subscription.status,
    season_pass_expires_at: subscriptionPeriodEnd(subscription),
  };
  if (activateFromPaidInvoice) {
    profile.season_pass_active = active;
    profile.season_pass_purchased_at = new Date().toISOString();
  } else if (!active || isTerminalSubscriptionStatus(subscription.status)) {
    // Do not leave access active through past_due, incomplete, paused, or a
    // terminal state. A later invoice.paid event is the only reactivation edge.
    profile.season_pass_active = false;
  }

  await supabase.from("tank_profiles").upsert(profile, { onConflict: "user_id" });
  await supabase
    .from("tank_purchases")
    .update({
      stripe_subscription_id: subscription.id,
      ...(activateFromPaidInvoice && active
        ? { status: "paid", fulfilled_at: new Date().toISOString() }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", identity.purchaseId)
    .eq("user_id", identity.userId);

  return identity;
}

async function handleTankInvoicePaid(
  supabase: any,
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const subscriptionId = subscriptionFromInvoice(invoice);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const identity = await syncTankSubscription(supabase, subscription, true);
  if (!identity) return;

  const product = resolveTankSubscriptionProduct(identity.productKey);
  if (!product) return;
  const grant = product.monthlyTokens;
  const { error } = await supabase
    .from("tank_token_transactions")
    .upsert(
      {
        user_id: identity.userId,
        amount: grant,
        reason: `stripe_subscription:${identity.productKey}`,
        stripe_invoice_id: invoice.id,
      },
      { onConflict: "stripe_invoice_id", ignoreDuplicates: true },
    );
  if (error) throw error;

  await supabase
    .from("tank_profiles")
    .update({ season_pass_tokens_granted_at: new Date().toISOString() })
    .eq("user_id", identity.userId)
    .eq("stripe_subscription_id", subscription.id);
}

async function handleTankInvoicePaymentFailed(
  supabase: any,
  stripe: Stripe,
  invoice: Stripe.Invoice,
) {
  const subscriptionId = subscriptionFromInvoice(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncTankSubscription(supabase, subscription, false);
}

async function syncTankSubscriptionLifecycle(
  supabase: any,
  subscription: Stripe.Subscription,
) {
  await syncTankSubscription(supabase, subscription, false);
}

// Handle failed payment
async function handlePaymentFailed(
  supabase: any,
  paymentIntent: Stripe.PaymentIntent
) {
  if (paymentIntent.metadata.tank_purchase_id) {
    const { error } = await supabase
      .from('tank_purchases')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', paymentIntent.metadata.tank_purchase_id)
      .eq('status', 'pending');
    if (error) console.error('[Tank Store] Failed to mark purchase failed:', error);
    return;
  }

  const orderId = paymentIntent.metadata.order_id;

  if (!orderId) {
    console.error('No order_id in payment intent metadata');
    return;
  }

  const lastError = paymentIntent.last_payment_error;

  const { data: order, error } = await supabase
    .from('orders')
    .update({
      payment_status: 'failed',
      payment_failed_at: new Date().toISOString(),
      payment_error_code: lastError?.code || null,
      payment_error_message: lastError?.message || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select('order_number, email, discount_reservation_id')
    .single();

  if (error) {
    console.error('Failed to update order on payment failure:', error);
    return;
  }

  console.log(`Order ${orderId} payment failed: ${lastError?.message}`);

  // Free the held discount slot immediately rather than waiting out the
  // full reservation TTL — a declined card shouldn't tie up a limited-use
  // code for 20 minutes.
  if (order?.discount_reservation_id) {
    try {
      await supabase.rpc('release_discount_reservation', { p_reservation_id: order.discount_reservation_id });
    } catch (releaseErr) {
      console.error('[Promo] ⚠️ Failed to release discount reservation:', releaseErr);
    }
  }

  // ── Failed payment notification → admins only ─────────────────
  try {
    const orderNum = order?.order_number ?? orderId;
    const reason = lastError?.message ?? 'Unknown reason';

    await sendNotification({
      title: `Payment failed — ${orderNum}`,
      subtitle: `${order?.email ?? 'Guest'} · ${reason}`,
      actionUrl: `/dashboard/orders`,
      role_admin: true,
    });

    console.log(`[Notifications] ✅ Failed payment notification sent for ${orderNum}`);
  } catch (notifErr) {
    console.error('[Notifications] ⚠️ Failed to send payment failure notification:', notifErr);
  }
}

// Handle requires action (3D Secure, etc.)
async function handleRequiresAction(
  supabase: any,
  paymentIntent: Stripe.PaymentIntent
) {
  const orderId = paymentIntent.metadata.order_id;

  if (!orderId) {
    console.error('No order_id in payment intent metadata');
    return;
  }

  const { error } = await supabase
    .from('orders')
    .update({
      requires_action: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (error) {
    console.error('Failed to update order requires_action:', error);
  }
}

// Handle successful charge (for fraud/risk data)
async function handleChargeSucceeded(
  supabase: any,
  charge: Stripe.Charge
) {
  const paymentIntentId = charge.payment_intent as string;

  if (!paymentIntentId) return;

  // Get order by payment intent
  const { data: order } = await supabase
    .from('orders')
    .select('id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (!order) return;

  // Update with charge and risk data
  const { error } = await supabase
    .from('orders')
    .update({
      stripe_charge_id: charge.id,
      stripe_risk_score: charge.outcome?.risk_score || null,
      stripe_risk_level: charge.outcome?.risk_level || null,
      billing_details: charge.billing_details || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (error) {
    console.error('Failed to update order with charge details:', error);
  }
}

// Handle refunded charge
async function handleChargeRefunded(
  supabase: any,
  charge: Stripe.Charge
) {
  const paymentIntentId = charge.payment_intent as string;

  if (!paymentIntentId) return;

  // Get order by payment intent
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_number, total_cents, email')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .single();

  if (!order) return;

  // Update order status
  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'refunded',
      status: 'refunded',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (error) {
    console.error('Failed to update order on refund:', error);
    return;
  }

  console.log(`Order ${order.id} refunded`);

  // ── Creator affiliate program: claw back any commission earned on this
  //    order. No-op if this order never earned one. ──
  try {
    await supabase.rpc('reverse_creator_commission', { p_order_id: order.id });
    console.log(`[Creator] ✅ Commission reversal checked for order ${order.id}`);
  } catch (creatorErr) {
    console.error('[Creator] ⚠️ Failed to reverse creator commission:', creatorErr);
  }

  // ── Refund notification → admins only ─────────────────────────
  try {
    const total = `$${(order.total_cents / 100).toFixed(2)}`;
    await sendNotification({
      title: `Order refunded — ${order.order_number}`,
      subtitle: `${order.email ?? 'Guest'} · ${total}`,
      actionUrl: `/dashboard/orders`,
      role_admin: true,
    });
  } catch (notifErr) {
    console.error('[Notifications] ⚠️ Failed to send refund notification:', notifErr);
  }
}
