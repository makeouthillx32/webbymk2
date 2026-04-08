// app/api/pos/charge/route.ts
//
// POST /api/pos/charge
// Admin-only. Creates an order + Stripe payment intent for a POS sale.
//
// Body:
//   items[]             - real product cart items { product_id, variant_id, product_title,
//                         variant_title, sku, quantity, price_cents }
//   custom_items[]      - keypad amounts { label, amount_cents }
//   customer_email      - optional
//   customer_first_name - optional
//   customer_last_name  - optional
//   discount_id         - optional
//   discount_code       - optional

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

// Sentinel IDs for custom/keypad line items that have no real product
const CUSTOM_PRODUCT_ID = "00000000-0000-0000-0000-000000000001";
const CUSTOM_VARIANT_ID = "00000000-0000-0000-0000-000000000001";

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function generateOrderNumber(): string {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `DCG-POS-${ymd}-${rand}`;
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return jsonError(401, "UNAUTHORIZED", "Authentication required");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const body = await req.json();
  const {
    items = [],
    custom_items = [],
    customer_email,
    customer_first_name,
    customer_last_name,
    discount_id,
    discount_code,
  } = body;

  if (!items.length && !custom_items.length) {
    return jsonError(400, "EMPTY_CART", "Cart is empty");
  }

  // ── Totals ────────────────────────────────────────────────────
  const itemsTotal: number = items.reduce(
    (sum: number, i: any) => sum + i.price_cents * i.quantity, 0
  );
  const customTotal: number = custom_items.reduce(
    (sum: number, i: any) => sum + i.amount_cents, 0
  );
  const subtotal_cents = itemsTotal + customTotal;

  if (subtotal_cents <= 0) return jsonError(400, "INVALID_TOTAL", "Total must be > 0");

  // ── Discount ──────────────────────────────────────────────────
  let discount_cents = 0;
  if (discount_id) {
    const { data: discount } = await supabase
      .from("discounts")
      .select("percent_off, amount_off_cents, is_active")
      .eq("id", discount_id)
      .single();

    if (discount?.is_active) {
      if (discount.percent_off) {
        discount_cents = Math.round(subtotal_cents * discount.percent_off / 100);
      } else if (discount.amount_off_cents) {
        discount_cents = Math.min(discount.amount_off_cents, subtotal_cents);
      }
    }
  }

  const total_cents = Math.max(0, subtotal_cents - discount_cents);

  // ── Create order ──────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number: generateOrderNumber(),
      status: "pending",
      payment_status: "pending",
      order_source: "pos",
      source: "pos",
      pos_staff_profile_id: profile?.id ?? null,
      profile_id: profile?.id ?? null,
      auth_user_id: user.id,
      subtotal_cents,
      shipping_cents: 0,
      tax_cents: 0,
      discount_cents,
      total_cents,
      currency: "USD",
      promo_code: discount_code ?? null,
      customer_email: customer_email ?? null,
      customer_first_name: customer_first_name ?? null,
      customer_last_name: customer_last_name ?? null,
      email: customer_email ?? profile?.email ?? user.email ?? null,
      internal_notes: "[POS] In-person sale",
    })
    .select("id, order_number, total_cents")
    .single();

  if (orderErr || !order) {
    return jsonError(500, "ORDER_CREATE_FAILED", orderErr?.message ?? "Failed to create order");
  }

  // ── Insert all order_items (products + custom amounts) ────────
  const allOrderItems = [
    // Real products
    ...items.map((item: any) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_title: item.product_title,
      variant_title: item.variant_title || "Default",
      sku: item.sku ?? null,
      quantity: item.quantity,
      price_cents: item.price_cents,
      currency: "USD",
    })),
    // Custom keypad amounts — use sentinel IDs so FK constraints are satisfied
    ...custom_items.map((item: any) => ({
      order_id: order.id,
      product_id: CUSTOM_PRODUCT_ID,
      variant_id: CUSTOM_VARIANT_ID,
      product_title: item.label || "Custom Amount",
      variant_title: "Custom",
      sku: null,
      quantity: 1,
      price_cents: item.amount_cents,
      currency: "USD",
    })),
  ];

  if (allOrderItems.length) {
    const { error: itemsErr } = await supabase.from("order_items").insert(allOrderItems);
    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id);
      return jsonError(500, "ORDER_ITEMS_FAILED", itemsErr.message);
    }
  }

  // ── Stripe payment intent ─────────────────────────────────────
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: total_cents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: {
        order_id: order.id,
        order_number: order.order_number,
        order_source: "pos",
        staff_user_id: user.id,
      },
      description: `POS — ${order.order_number}`,
    });
  } catch (stripeErr: any) {
    await supabase.from("orders").delete().eq("id", order.id);
    return jsonError(500, "STRIPE_FAILED", stripeErr.message);
  }

  await supabase
    .from("orders")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", order.id);

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      order_number: order.order_number,
      total_cents: order.total_cents,
      discount_cents,
    },
    payment_intent: {
      id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
    },
  });
}