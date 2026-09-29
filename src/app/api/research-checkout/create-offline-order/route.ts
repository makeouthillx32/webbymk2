// app/api/research-checkout/create-offline-order/route.ts
//
// Endpoint for submitting an offline payment order (e.g. Zelle) for research checkout.
// Auth-only: records order in 'orders' and 'order_items' with status='pending',
// payment_status='pending', and payment_method='zelle'.
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireResearcherRole } from "@/lib/research/requireResearcherRole";
import { NextRequest, NextResponse } from "next/server";
import { createCommerceStripe } from "@/lib/stripe/commerce";
import { calcPackageProtectionCents } from "@/lib/research/checkoutTotals";
import { closeResearchCart } from "@/lib/research/closeResearchCart";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
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
      marketing_opt_in,
      package_protection,
    } = body;

    const marketingOptIn = marketing_opt_in === true;
    const hasProtection = package_protection === true;

    if (!cart_id || !shipping_address || !shipping_rate_id) {
      return NextResponse.json(
        { error: "Missing required fields: cart_id, shipping_address, and shipping_rate_id" },
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

    // ── Marketing consent ──────────────────────────────────────────
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

    // ── Supersede the pending card order ────────────────────────────
    // The payment page creates a pending card order + PaymentIntent on load
    // even when the customer ends up choosing Zelle. orders_pending_research_
    // cart_uidx allows ONE pending research order per cart, so without this
    // the insert below fails with a unique violation whenever the card order
    // was created first — i.e. always. Cancel the dead PaymentIntent and
    // release its discount hold (same cleanup create-payment-intent does for
    // a dead PI), unless a card payment is genuinely in flight.
    const { data: stalePending } = await supabase
      .from("orders")
      .select("id, stripe_payment_intent_id, discount_reservation_id")
      .eq("research_cart_id", cart_id)
      .eq("order_source", "research")
      .eq("payment_status", "pending");

    if (stalePending && stalePending.length > 0) {
      const { stripe } = createCommerceStripe("labs");

      for (const stale of stalePending) {
        if (stale.stripe_payment_intent_id) {
          try {
            const pi = await stripe.paymentIntents.retrieve(stale.stripe_payment_intent_id);
            if (["processing", "succeeded"].includes(pi.status)) {
              return NextResponse.json(
                { error: "A card payment for this cart is already in progress. Please wait for it to finish." },
                { status: 409 }
              );
            }
            if (pi.status !== "canceled") await stripe.paymentIntents.cancel(stale.stripe_payment_intent_id);
          } catch (err) {
            console.error("Failed to cancel superseded PaymentIntent:", err);
          }
        }

        if (stale.discount_reservation_id) {
          try {
            await supabase.rpc("release_discount_reservation", {
              p_reservation_id: stale.discount_reservation_id,
            });
          } catch (releaseErr) {
            console.error("Failed to release discount reservation on superseded order:", releaseErr);
          }
        }

        await supabase
          .from("orders")
          .update({ payment_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", stale.id)
          .eq("payment_status", "pending");
      }
    }

    // ── Discount ──────────────────────────────────────────────────
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

    // ── Package Protection calculation ────────────────────────────
    // Shared with the card route — see lib/research/checkoutTotals.ts.
    const package_protection_cents = calcPackageProtectionCents(subtotal_cents, discount_cents, hasProtection);

    const total_cents = subtotal_cents + shipping_cents + tax_cents - discount_cents + package_protection_cents;

    // ── Generate Unique 6-Digit Order Number ───────────────────────
    let order_number = "";
    let isUnique = false;
    for (let attempts = 0; attempts < 5; attempts++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("order_number", candidate)
        .maybeSingle();
      if (!existing) {
        order_number = candidate;
        isUnique = true;
        break;
      }
    }

    if (!isUnique) {
      order_number = `RX-${Date.now().toString().slice(-6)}`;
    }

    const customerNotes = [
      "Offline Payment Method: Zelle",
      "Zelle Destination: labs@unenter.live",
      `Zelle Memo Required: Order #${order_number}`,
      hasProtection ? `Package Protection: $${(package_protection_cents / 100).toFixed(2)} included` : null,
    ].filter(Boolean).join(" | ");

    // ── Insert into orders ────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number,
        research_cart_id: cart_id,
        profile_id: authUserId,
        auth_user_id: authUserId,
        user_id: authUserId,
        email: resolvedEmail,
        customer_email: resolvedEmail,
        customer_first_name: shipping_address.firstName || "",
        customer_last_name: shipping_address.lastName || "",
        status: "pending",
        payment_status: "pending",
        payment_method: "zelle",
        payment_method_brand: "zelle",
        subtotal_cents,
        shipping_cents,
        tax_cents,
        discount_cents,
        promo_code: resolved_promo_code,
        discount_reservation_id,
        total_cents,
        currency: "USD",
        shipping_address,
        billing_address: billing_address || shipping_address,
        phone: phone || shipping_address.phone || null,
        shipping_method_name,
        order_source: "research",
        source: "research",
        customer_notes: customerNotes,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Offline order creation error:", orderError);
      return NextResponse.json(
        { error: "Failed to create order record", details: orderError?.message },
        { status: 500 }
      );
    }

    // ── Insert order_items ────────────────────────────────────────
    const orderItems = cartItems.map((item) => ({
      order_id: order.id,
      research_product_id: item.research_product_id,
      research_variant_id: item.research_variant_id,
      quantity: item.quantity,
      price_cents: item.price_cents,
      product_title: item.product_title || "Research Product",
      variant_title: item.variant_title || "Default",
      title: item.product_title || "Research Product",
      currency: "usd",
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Offline order items insertion error:", itemsError);
    }

    // ── Close the cart (clear items + mark converted) ─────────────
    await closeResearchCart(createAdminClient(), cart_id, authUserId);

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        order_number: order.order_number,
        total_cents: order.total_cents,
        payment_method: "zelle",
      },
    });
  } catch (err: any) {
    console.error("Create offline order failed:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err?.message },
      { status: 500 }
    );
  }
}
