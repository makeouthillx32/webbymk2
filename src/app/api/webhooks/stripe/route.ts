// app/api/webhooks/stripe/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { sendNotification } from "@/lib/notifications";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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
    const supabase = await createServerClient();

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(supabase, paymentIntent);
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

  // Update order — also select promo_code for usage tracking below
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
    .select('order_number, total_cents, email, customer_first_name, customer_last_name, promo_code, order_source')
    .single();

  if (error) {
    console.error('Failed to update order on payment success:', error);
    return;
  }

  console.log(`Order ${orderId} marked as paid + ${newStatus}${isPOS ? ' (POS — auto-fulfilled)' : ''}`);

  // ── Increment promo code usage count (web orders only — POS has no promos) ──
  if (order?.promo_code) {
    try {
      await supabase.rpc('increment_discount_uses', { p_code: order.promo_code });
      console.log(`[Promo] ✅ Incremented uses_count for code: ${order.promo_code}`);
    } catch (promoErr) {
      // Non-fatal — order is paid, don't throw
      console.error('[Promo] ⚠️ Failed to increment uses_count:', promoErr);
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
    .select('order_number, email')
    .single();

  if (error) {
    console.error('Failed to update order on payment failure:', error);
    return;
  }

  console.log(`Order ${orderId} payment failed: ${lastError?.message}`);

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