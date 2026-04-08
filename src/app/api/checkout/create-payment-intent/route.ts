// app/api/checkout/create-payment-intent/route.ts
import { createServerClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

export async function POST(request: NextRequest) {
  try {
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
    } = body;

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
    const guestKeyCookie = request.cookies.get("dcg_guest_key")?.value ?? null;
    const guestKey = guestKeyCookie ?? crypto.randomUUID();
    console.log("Guest key:", guestKey);

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
    let discount_cents = 0;
    let resolved_promo_code: string | null = null;

    if (promo_code) {
      const { data: discountRow } = await supabase
        .from("discounts")
        .select("type, percent_off, amount_off_cents, max_uses, uses_count, is_active, starts_at, ends_at")
        .eq("code", promo_code.toUpperCase())
        .eq("is_active", true)
        .single();

      if (discountRow) {
        const withinUseLimit = !discountRow.max_uses || discountRow.uses_count < discountRow.max_uses;
        const notExpired = !discountRow.ends_at || new Date(discountRow.ends_at) > new Date();

        if (withinUseLimit && notExpired) {
          if (discountRow.type === "percentage" && discountRow.percent_off) {
            discount_cents = Math.round(subtotal_cents * (discountRow.percent_off / 100));
          } else if (discountRow.type === "fixed" && discountRow.amount_off_cents) {
            discount_cents = discountRow.amount_off_cents;
          }
          // Never discount more than the subtotal
          discount_cents = Math.min(discount_cents, subtotal_cents);
          resolved_promo_code = promo_code.toUpperCase();
          console.log(`Promo ${resolved_promo_code} applied — discount: $${(discount_cents / 100).toFixed(2)}`);
        } else {
          console.log(`Promo ${promo_code} failed re-validation (expired or limit reached)`);
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
    const order_number = `DCG-${timestamp}-${random}`;

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
            p_marketing: false,
          }
        );
        if (customerError) {
          console.error("upsert_guest_customer error:", customerError);
        } else {
          customerId = customerData as string;
          console.log("Guest customer upserted:", customerId);
        }
      } catch (err) {
        console.error("upsert_guest_customer threw:", err);
      }
    }

    // ── Create order ──────────────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number,
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
        total_cents,
        shipping_address,
        shipping_method_name,
        customer_id: customerId,
        guest_key: authUserId ? null : guestKey,
      })
      .select()
      .single();

    if (orderError || !order) {
      console.error("Order creation error:", orderError);
      return NextResponse.json(
        { error: "Failed to create order", details: orderError?.message },
        { status: 500 }
      );
    }

    console.log("Order created:", order.id);

    // ── Create order items ────────────────────────────────────────
    const orderItems = cartItems.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      price_cents: item.price_cents,
      product_title: (item.products as any)?.title || "Product",
      variant_title: (item.product_variants as any)?.title || "Default",
      sku: (item.product_variants as any)?.sku || null,
    }));

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
    const paymentIntent = await stripe.paymentIntents.create({
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
      shipping: {
        name: `${shipping_address.firstName} ${shipping_address.lastName}`,
        address: {
          line1: shipping_address.address1,
          line2: shipping_address.address2 || undefined,
          city: shipping_address.city,
          state: shipping_address.state,
          postal_code: shipping_address.zip,
          country: "US",
        },
      },
    });

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