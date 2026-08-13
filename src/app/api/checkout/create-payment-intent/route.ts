// app/api/checkout/create-payment-intent/route.ts
import { createServerClient } from "@/utils/supabase/server";
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
      email,
      shipping_address,
      billing_address,
      phone,
      shipping_rate_id,
      shipping_rate_data, // full rate object passed from client for live USPS rates
      promo_code,         // optional promo/discount code
      marketing_opt_in,   // checkout consent checkbox — feeds customers/profiles.marketing_opt_in
    } = body;

    const marketingOptIn = marketing_opt_in === true;

    console.log("Creating payment intent for:", { cart_id, email });

    // Validation
    if (!cart_id || !email || !shipping_address || !shipping_rate_id) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // ── Detect authenticated member (server-side, trusted) ────────
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    const authUserId = authUser?.id ?? null;
    const authEmail = authUser?.email ?? null;

    // Members: always use the account email. Guests: trust the form.
    const resolvedEmail = authUserId ? (authEmail ?? email) : email;

    console.log(
      authUserId
        ? `Member checkout — profile: ${authUserId}, email: ${resolvedEmail}`
        : `Guest checkout — email: ${resolvedEmail}`
    );

    // ── Guest key ─────────────────────────────────────────────────
    const guestKeyCookie = request.cookies.get("unenter_guest_key")?.value ?? null;
    const guestKey = guestKeyCookie ?? crypto.randomUUID();
    console.log("Guest key:", guestKey);

    // ── Theme snapshot (for recoloring order emails later) ─────────
    const themeId = request.cookies.get("themeId")?.value ?? null;

    // ── Cart items ────────────────────────────────────────────────
    const { data: cartItems, error: cartError } = await supabase
      .from("cart_items")
      .select(`
        id,
        quantity,
        price_cents,
        product_id,
        variant_id,
        products (
          id,
          title
        ),
        product_variants (
          id,
          title,
          sku
        )
      `)
      .eq("cart_id", cart_id);

    if (cartError || !cartItems || cartItems.length === 0) {
      console.error("Cart error:", cartError);
      return NextResponse.json(
        { error: "Cart not found or empty" },
        { status: 400 }
      );
    }

    console.log("Cart items:", cartItems);

    // ── Subtotal ──────────────────────────────────────────────────
    const subtotal_cents = cartItems.reduce(
      (sum, item) => sum + item.price_cents * item.quantity,
      0
    );

    // ── Shipping rate ─────────────────────────────────────────────
    // Live USPS rates have IDs like "usps-usps_ground_advantage" or "usps-ground-free"
    // Flat DB rates have UUID IDs — look those up in the shipping_rates table
    let shipping_cents = 0;
    let shipping_method_name = "Standard Shipping";

    const isUSPSRate = shipping_rate_id.startsWith("usps-");

    if (isUSPSRate) {
      // Price and name were passed directly from the client alongside the rate ID
      shipping_cents = shipping_rate_data?.price_cents ?? 0;
      shipping_method_name = shipping_rate_data?.name ?? "Standard Shipping";
      console.log(`USPS rate: ${shipping_method_name} — $${(shipping_cents / 100).toFixed(2)}`);
    } else {
      // Flat DB rate — look up by UUID
      const { data: shippingRate, error: shippingError } = await supabase
        .from("shipping_rates")
        .select("*")
        .eq("id", shipping_rate_id)
        .single();

      if (shippingError || !shippingRate) {
        console.error("Shipping rate error:", shippingError);
        return NextResponse.json(
          { error: "Invalid shipping rate" },
          { status: 400 }
        );
      }

      shipping_cents = shippingRate.price_cents || shippingRate.amount_cents || 0;
      shipping_method_name = shippingRate.name ?? "Standard Shipping";
      console.log(`DB rate: ${shipping_method_name} — $${(shipping_cents / 100).toFixed(2)}`);
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
    // max_uses is enforced atomically here via reserve_discount_use — a
    // plain "uses_count < max_uses" read-check used to be the only gate,
    // with the actual increment deferred all the way to the Stripe webhook.
    // That left the entire payment-processing window open for concurrent
    // checkouts to all pass the check and all eventually oversell a
    // limited-use code. reserve_discount_use takes a row lock on `discounts`
    // so concurrent callers for the same code serialize, and holds a short
    // TTL reservation that only becomes a permanent use once the webhook
    // confirms payment actually succeeded. Fixed 2026-08-10.
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

        if (reserveErr) {
          console.log(`Promo ${promo_code} rejected: ${reserveErr.message}`);
        } else {
          discount_reservation_id = (reservationId as string | null) ?? null; // null = unlimited-use code

          if (discountRow.type === "percentage" && discountRow.percent_off) {
            discount_cents = Math.round(subtotal_cents * (discountRow.percent_off / 100));
          } else if (discountRow.type === "fixed" && discountRow.amount_off_cents) {
            discount_cents = discountRow.amount_off_cents;
          }
          // Never discount more than the subtotal
          discount_cents = Math.min(discount_cents, subtotal_cents);
          resolved_promo_code = promo_code.toUpperCase();
          console.log(`Promo ${resolved_promo_code} applied — discount: $${(discount_cents / 100).toFixed(2)}`);
        }
      } else {
        console.log(`Promo ${promo_code} not found or inactive`);
      }
    }

    const total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents;

    console.log("Order totals:", { subtotal_cents, shipping_cents, tax_cents, discount_cents, total_cents });

    // ── Order number ──────────────────────────────────────────────
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const order_number = `UNENTER-${timestamp}-${random}`;

    // ── Upsert guest customer ─────────────────────────────────────
    let customerId: string | null = null;
    if (!authUserId) {
      try {
        const { data: customerData, error: customerError } = await supabase.rpc(
          "upsert_guest_customer",
          {
            p_guest_key: guestKey,
            p_email: resolvedEmail.toLowerCase().trim(),
            p_first_name: shipping_address.firstName ?? null,
            p_last_name: shipping_address.lastName ?? null,
            p_phone: phone ?? shipping_address.phone ?? null,
            p_marketing: marketingOptIn,
          }
        );
        if (customerError) {
          console.error("upsert_guest_customer error:", customerError);
        } else {
          customerId = customerData as string;
          console.log("Guest customer upserted:", customerId, marketingOptIn ? "(marketing opt-in)" : "");
        }
      } catch (err) {
        console.error("upsert_guest_customer threw:", err);
      }
    } else if (marketingOptIn) {
      // Member checkout — upsert_guest_customer doesn't run for signed-in
      // users, so capture consent on their profile instead. Upgrade-only:
      // an unchecked box on THIS order must never silently revoke consent
      // a prior order already granted, so we only ever write true.
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
          console.log(`Member ${authUserId} opted into marketing`);
        }
      } catch (err) {
        console.error("Failed to record member marketing opt-in:", err);
      }
    }

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
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price_cents: item.price_cents,
        product_title: (item.products as any)?.title || "Product",
        variant_title: (item.product_variants as any)?.title || "Default",
        sku: (item.product_variants as any)?.sku || null,
      }));

    // ── Double-submit / duplicate-order guard ───────────────────────
    // A double-click on "Pay", a retry after a network blip, or two open
    // tabs on the same cart could previously race two POSTs here into two
    // separate orders + two separate Stripe PaymentIntents for one cart.
    // If a pending order already exists for this cart, refresh it in place
    // (new totals, new order_items, updated PaymentIntent) instead of
    // minting a duplicate. Backed at the DB level by orders_pending_cart_uidx
    // — see the catch on the insert below for the residual race window.
    // Fixed 2026-08-11.
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

      // A payment already in flight or complete for this cart must never be
      // clobbered — updating/replacing it here could double-charge the
      // customer or desync our order from a payment Stripe already took.
      // Hand the client back the same PI as-is so it can poll/redirect on
      // the outcome exactly as if this were the original request.
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
        // Truly dead PI (e.g. canceled) — not safe to reuse. Release any
        // discount hold it was carrying and bump the order to 'failed' so
        // it stops occupying the unique pending-cart index slot, then fall
        // through to create a fresh order below.
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
          auth_user_id: authUserId ?? "",
          guest_key: authUserId ? "" : guestKey,
          customer_id: customerId ?? "",
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
          shipping_method_name,
          customer_id: customerId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      await supabase.from("order_items").delete().eq("order_id", existing.id);
      const { error: reinsertErr } = await supabase.from("order_items").insert(buildOrderItems(existing.id));
      if (reinsertErr) console.error("Failed to refresh order_items on reused order:", reinsertErr);

      console.log(`Reused pending order ${existing.id} for cart ${cart_id} — updated PI ${updatedPI.id}`);

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
      .eq("order_source", "web")
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
        shipping_method_name,
        customer_id: customerId,
        guest_key: authUserId ? null : guestKey,
        theme_id: themeId,
      })
      .select()
      .single();

    if (orderError || !order) {
      // Residual race: two concurrent requests both saw "no pending order"
      // above and both tried to insert — the loser hits orders_pending_cart_uidx.
      // Re-fetch the winner's order and reuse it instead of erroring out.
      if (orderError?.code === "23505") {
        const { data: winner } = await supabase
          .from("orders")
          .select("id, order_number, stripe_payment_intent_id, total_cents, discount_reservation_id")
          .eq("cart_id", cart_id)
          .eq("order_source", "web")
          .eq("payment_status", "pending")
          .maybeSingle();

        if (winner) {
          const reused = await reuseExistingOrder(winner);
          if (reused) return reused;
        }
      }

      console.error("Order creation error:", orderError);
      return NextResponse.json(
        { error: "Failed to create order", details: orderError?.message },
        { status: 500 }
      );
    }

    console.log("Order created:", order.id);

    // ── Create order items ────────────────────────────────────────
    const orderItems = buildOrderItems(order.id);

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items error:", itemsError);
      return NextResponse.json(
        { error: "Failed to create order items", details: itemsError.message },
        { status: 500 }
      );
    }

    console.log("Order items created:", orderItems.length);

    // ── Create Stripe Payment Intent ──────────────────────────────
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: total_cents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          auth_user_id: authUserId ?? "",
          guest_key: authUserId ? "" : guestKey,
          customer_id: customerId ?? "",
        },
        description: `Order ${order.order_number}`,
        shipping: shippingForStripe,
      },
      { idempotencyKey: `pi-create-${order.id}` }
    );

    console.log("Payment intent created:", paymentIntent.id);

    // ── Link PI to order ──────────────────────────────────────────
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
    console.error("Create payment intent error:", error);
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
