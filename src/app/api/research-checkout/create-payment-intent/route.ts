// app/api/research-checkout/create-payment-intent/route.ts
//
// Mirrors /api/checkout/create-payment-intent but for research_cart_items.
// Research checkout is auth-only — no guest path. Writes into the SAME
// orders/order_items tables as shop (order_source='research', order_items
// rows use research_product_id/research_variant_id instead of product_id/
// variant_id — see the order_items_exactly_one_item_type CHECK constraint).
import { createServerClient } from "@/utils/supabase/server";
import { requireResearcherRole } from "@/lib/research/requireResearcherRole";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Constructing Stripe INSIDE the try block matters: if STRIPE_SECRET_KEY
    // is missing/blank, the SDK throws synchronously ("Neither apiKey nor
    // config.authenticator provided") — outside try/catch that's an uncaught
    // exception, which Next.js turns into an empty-body response the client
    // can't even JSON.parse() ("Unexpected end of JSON input"), instead of
    // the graceful JSON error this route already returns for every other
    // failure mode. Found via E2E checkout test, 2026-08-06.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const supabase = await createServerClient();
    const body = await request.json();

    const {
      cart_id,
      shipping_address,
      billing_address,
      phone,
      shipping_rate_id,
      shipping_rate_data,
      promo_code,
      marketing_opt_in, // checkout consent checkbox — feeds profiles.marketing_opt_in
    } = body;

    const marketingOptIn = marketing_opt_in === true;

    if (!cart_id || !shipping_address || !shipping_rate_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ── Research checkout requires a signed-in researcher ──────────
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { error: "Sign in required to check out research products" },
        { status: 401 }
      );
    }

    const roleGate = await requireResearcherRole(supabase, authUser.id);
    if (roleGate.ok === false) {
      return NextResponse.json({ error: roleGate.message }, { status: roleGate.status });
    }

    const authUserId = authUser.id;
    const resolvedEmail = authUser.email ?? "";

    // ── Theme snapshot (for recoloring order emails later) ──────────
    const themeId = request.cookies.get("themeId")?.value ?? null;

    // ── Marketing consent (upgrade-only — see shop checkout route for why) ──
    if (marketingOptIn) {
      try {
        const { data: existingProfile } = await supabase
          .from("profiles")
          .select("marketing_opt_in")
          .eq("id", authUserId)
          .single();

        if (!existingProfile?.marketing_opt_in) {
          await supabase
            .from("profiles")
            .update({ marketing_opt_in: true, marketing_opt_in_at: new Date().toISOString() })
            .eq("id", authUserId);
          console.log(`Researcher ${authUserId} opted into marketing`);
        }
      } catch (err) {
        console.error("Failed to record researcher marketing opt-in:", err);
      }
    }

    // ── Cart items ────────────────────────────────────────────────
    const { data: cartItems, error: cartError } = await supabase
      .from("research_cart_items")
      .select(
        "id, quantity, price_cents, research_product_id, research_variant_id, product_title, variant_title"
      )
      .eq("cart_id", cart_id);

    if (cartError || !cartItems || cartItems.length === 0) {
      console.error("Research cart error:", cartError);
      return NextResponse.json(
        { error: "Cart not found or empty" },
        { status: 400 }
      );
    }

    // ── Subtotal ──────────────────────────────────────────────────
    const subtotal_cents = cartItems.reduce(
      (sum, item) => sum + item.price_cents * item.quantity,
      0
    );

    // ── Shipping rate ─────────────────────────────────────────────
    let shipping_cents = 0;
    let shipping_method_name = "Standard Shipping";

    const isUSPSRate = shipping_rate_id.startsWith("usps-");

    if (isUSPSRate) {
      shipping_cents = shipping_rate_data?.price_cents ?? 0;
      shipping_method_name = shipping_rate_data?.name ?? "Standard Shipping";
    } else {
      const { data: shippingRate, error: shippingError } = await supabase
        .from("shipping_rates")
        .select("*")
        .eq("id", shipping_rate_id)
        .single();

      if (shippingError || !shippingRate) {
        return NextResponse.json(
          { error: "Invalid shipping rate" },
          { status: 400 }
        );
      }

      shipping_cents = shippingRate.price_cents || shippingRate.amount_cents || 0;
      shipping_method_name = shippingRate.name ?? "Standard Shipping";
    }

    // ── Tax ───────────────────────────────────────────────────────
    const { data: taxData } = await supabase
      .from("tax_rates")
      .select("rate")
      .eq("state", shipping_address.state)
      .eq("is_active", true);

    const taxRate = taxData?.reduce((sum, t) => sum + Number(t.rate), 0) || 0;
    const tax_cents = Math.round((subtotal_cents + shipping_cents) * taxRate);

    // ── Discount (server-side re-validation) ──────────────────────
    // See app/api/checkout/create-payment-intent/route.ts for why this uses
    // reserve_discount_use instead of a plain read-check — closes a race
    // condition that could oversell a limited-use code. Fixed 2026-08-10.
    let discount_cents = 0;
    let resolved_promo_code: string | null = null;
    let discount_reservation_id: string | null = null;

    if (promo_code) {
      const { data: discountRow } = await supabase
        .from("discounts")
        .select("id, type, percent_off, amount_off_cents, is_active")
        .eq("code", promo_code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (discountRow) {
        const { data: reservationId, error: reserveErr } = await supabase.rpc("reserve_discount_use", {
          p_discount_id: discountRow.id,
          p_customer_key: resolvedEmail ? resolvedEmail.toLowerCase().trim() : null,
        });

        if (!reserveErr) {
          discount_reservation_id = (reservationId as string | null) ?? null;

          if (discountRow.type === "percentage" && discountRow.percent_off) {
            discount_cents = Math.round(subtotal_cents * (discountRow.percent_off / 100));
          } else if (discountRow.type === "fixed" && discountRow.amount_off_cents) {
            discount_cents = discountRow.amount_off_cents;
          }
          discount_cents = Math.min(discount_cents, subtotal_cents);
          resolved_promo_code = promo_code.toUpperCase();
        }
      }
    }

    const total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents;

    // ── Order number ──────────────────────────────────────────────
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const order_number = `UNENTER-RX-${timestamp}-${random}`;

    const shippingForStripe = {
      name: `${shipping_address.firstName} ${shipping_address.lastName}`,
      address: {
        line1: shipping_address.address1,
        line2: shipping_address.address2 || undefined,
        city: shipping_address.city,
        state: shipping_address.state,
        postal_code: shipping_address.zip,
        country: "US",
      },
    };

    const buildOrderItems = (orderId: string) =>
      cartItems.map((item) => ({
        order_id: orderId,
        research_product_id: item.research_product_id,
        research_variant_id: item.research_variant_id,
        quantity: item.quantity,
        price_cents: item.price_cents,
        product_title: item.product_title || "Research Product",
        variant_title: item.variant_title || "Default",
        title: item.product_title || "Research Product",
        currency: "usd",
      }));

    // ── Double-submit / duplicate-order guard ───────────────────────
    // Mirrors app/api/checkout/create-payment-intent/route.ts — see there
    // for the full rationale. Backed by orders_pending_cart_uidx. Fixed
    // 2026-08-11.
    const reuseExistingOrder = async (existing: {
      id: string;
      order_number: string;
      stripe_payment_intent_id: string | null;
      total_cents: number;
      discount_reservation_id: string | null;
    }) => {
      if (!existing.stripe_payment_intent_id) return null;

      let existingPI;
      try {
        existingPI = await stripe.paymentIntents.retrieve(existing.stripe_payment_intent_id);
      } catch (err) {
        console.error("Failed to retrieve existing PaymentIntent:", err);
        return null;
      }

      // Payment already in flight or complete — hand back the same PI as-is
      // rather than touching it. See shop checkout route for full rationale.
      if (["processing", "succeeded"].includes(existingPI.status)) {
        return NextResponse.json({
          success: true,
          order: { id: existing.id, order_number: existing.order_number, total_cents: existing.total_cents },
          payment_intent: {
            id: existingPI.id,
            client_secret: existingPI.client_secret,
            amount: existingPI.amount,
            status: existingPI.status,
          },
        });
      }

      const updatable = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(
        existingPI.status
      );
      if (!updatable) {
        if (existing.discount_reservation_id) {
          try {
            await supabase.rpc("release_discount_reservation", {
              p_reservation_id: existing.discount_reservation_id,
            });
          } catch (releaseErr) {
            console.error("Failed to release discount reservation on dead PI:", releaseErr);
          }
        }
        await supabase
          .from("orders")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("payment_status", "pending");
        return null;
      }

      const updatedPI = await stripe.paymentIntents.update(existing.stripe_payment_intent_id, {
        amount: total_cents,
        metadata: {
          order_id: existing.id,
          order_number: existing.order_number,
          auth_user_id: authUserId,
          order_source: "research",
        },
        shipping: shippingForStripe,
      });

      await supabase
        .from("orders")
        .update({
          subtotal_cents,
          shipping_cents,
          tax_cents,
          discount_cents,
          promo_code: resolved_promo_code,
          discount_reservation_id,
          total_cents,
          shipping_address,
          billing_address: billing_address ?? shipping_address,
          phone: phone ?? shipping_address.phone ?? null,
          shipping_method_name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      await supabase.from("order_items").delete().eq("order_id", existing.id);
      const { error: reinsertErr } = await supabase.from("order_items").insert(buildOrderItems(existing.id));
      if (reinsertErr) console.error("Failed to refresh order_items on reused research order:", reinsertErr);

      console.log(`Reused pending research order ${existing.id} for cart ${cart_id} — updated PI ${updatedPI.id}`);

      return NextResponse.json({
        success: true,
        order: { id: existing.id, order_number: existing.order_number, total_cents },
        payment_intent: {
          id: updatedPI.id,
          client_secret: updatedPI.client_secret,
          amount: updatedPI.amount,
          status: updatedPI.status,
        },
      });
    };

    const { data: existingPending } = await supabase
      .from("orders")
      .select("id, order_number, stripe_payment_intent_id, total_cents, discount_reservation_id")
      .eq("cart_id", cart_id)
      .eq("order_source", "research")
      .eq("payment_status", "pending")
      .maybeSingle();

    if (existingPending) {
      const reused = await reuseExistingOrder(existingPending);
      if (reused) return reused;
    }

    // ── Create order ──────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number,
        cart_id,
        profile_id: authUserId,
        auth_user_id: authUserId,
        email: resolvedEmail,
        customer_email: resolvedEmail,
        status: "pending",
        payment_status: "pending",
        subtotal_cents,
        shipping_cents,
        tax_cents,
        discount_cents,
        promo_code: resolved_promo_code,
        discount_reservation_id,
        total_cents,
        shipping_address,
        billing_address: billing_address ?? shipping_address,
        phone: phone ?? shipping_address.phone ?? null,
        shipping_method_name,
        order_source: "research",
        source: "research",
        guest_key: null,
        theme_id: themeId,
      })
      .select()
      .single();

    if (orderError || !order) {
      // Residual race — see shop checkout route for full explanation.
      if (orderError?.code === "23505") {
        const { data: winner } = await supabase
          .from("orders")
          .select("id, order_number, stripe_payment_intent_id")
          .eq("cart_id", cart_id)
          .eq("order_source", "research")
          .eq("payment_status", "pending")
          .maybeSingle();

        if (winner) {
          const reused = await reuseExistingOrder(winner);
          if (reused) return reused;
        }
      }

      console.error("Research order creation error:", orderError);
      return NextResponse.json(
        { error: "Failed to create order", details: orderError?.message },
        { status: 500 }
      );
    }

    // ── Create order items ────────────────────────────────────────
    const orderItems = buildOrderItems(order.id);

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Research order items error:", itemsError);
      return NextResponse.json(
        { error: "Failed to create order items", details: itemsError.message },
        { status: 500 }
      );
    }

    // ── Create Stripe Payment Intent ──────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: total_cents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          auth_user_id: authUserId,
          order_source: "research",
        },
        description: `Order ${order.order_number}`,
        shipping: shippingForStripe,
      },
      { idempotencyKey: `pi-create-${order.id}` }
    );

    await supabase
      .from("orders")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", order.id);

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total_cents: order.total_cents,
      },
      payment_intent: {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        status: paymentIntent.status,
      },
    });
  } catch (error: any) {
    console.error("Create research payment intent error:", error);
    return NextResponse.json(
      {
        error: "Failed to create payment intent",
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
