// app/api/webhooks/stripe/route.ts
import { createAdminClient } from "@/utils/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { sendNotification } from "@/lib/notifications";
import { sendOrderConfirmationEmail } from "@/lib/mail/sendOrderConfirmation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
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
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }

    // Create Supabase client (service role for webhook operations)
    const supabase = createAdminClient();

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(supabase, stripe, paymentIntent);
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
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(supabase, charge);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
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
  paymentIntent: Stripe.PaymentIntent
) {
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

// Handle failed payment
async function handlePaymentFailed(
  supabase: any,
  paymentIntent: Stripe.PaymentIntent
) {
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
