"use server";

import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createCommerceStripe } from "@/lib/stripe/commerce";
import { TANK_PRODUCTS, type TankProductKey } from "../tankProducts";

// Bones only — test-mode Stripe keys (STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET
// in .env are already test-mode, confirmed earlier this session; the live
// restricted key pasted separately stays unwired). Fixed local catalog
// (tankProducts.ts) rather than a Stripe Product/Price catalog — nothing
// here needs to be admin-configurable yet, this is the minimum real,
// working path from "click buy" to "tokens land in tank_profiles".

export type CreatePurchaseResult =
  | { success: true; clientSecret: string; purchaseId: string; amountCents: number }
  | { success: false; error: string };

/**
 * Embedded checkout, not a redirect.
 *
 * This returned a `checkoutUrl` and the overlay did window.location.assign() —
 * which threw the viewer out of Tank onto a Stripe-hosted page mid-stream, lost
 * the room they were watching, and brought them back on a query string. The
 * client secret below mounts Stripe's own checkout INSIDE the Tank overlay, so
 * nobody leaves the house to buy a pass.
 *
 * Everything that made the redirect version safe is unchanged: the price is
 * still validated against the Tank catalog, the session is still idempotent per
 * purchase row, and fulfilment still happens on the webhook rather than on
 * anything the browser says.
 */
export type CreateSubscriptionResult =
  | { success: true; clientSecret: string; purchaseId: string }
  | { success: false; error: string };

type PassProductKey = "season_pass" | "season_pass_xl";

function isPassProductKey(key: TankProductKey): key is PassProductKey {
  return key === "season_pass" || key === "season_pass_xl";
}

function subscriptionPriceId(key: PassProductKey, mode: "test" | "live"): string {
  const productName = key === "season_pass" ? "SEASON_PASS" : "SEASON_PASS_XL";
  const modePart = mode === "live" ? "LIVE_" : "";
  const envName = `STRIPE_TANK_${modePart}${productName}_PRICE_ID`;
  const value = process.env[envName]?.trim();
  if (!value?.startsWith("price_")) {
    throw new Error(`${envName} is not configured`);
  }
  return value;
}

function tankPublicOrigin(): string {
  const configured = process.env.TANK_PUBLIC_ORIGIN?.trim();
  if (!configured) return "https://tank.unenter.live";
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("TANK_PUBLIC_ORIGIN must use HTTPS");
  }
  return url.origin;
}

export async function createTankPurchaseIntent(productKey: TankProductKey): Promise<CreatePurchaseResult> {
  const product = TANK_PRODUCTS[productKey];
  if (!product) return { success: false, error: "Unknown product." };
  if (isPassProductKey(productKey)) {
    return { success: false, error: "Season passes use recurring subscription checkout." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  // Constructed inside the function body (not module scope) — if
  // STRIPE_SECRET_KEY is missing/blank the SDK throws synchronously, and
  // this way it's caught by the try/catch instead of surfacing as an
  // opaque 500 (same reasoning as the shop's create-payment-intent route).
  const admin = createAdminClient();

  try {
    const { stripe, mode } = createCommerceStripe("tank");

    const { data: purchase, error: insertError } = await admin
      .from("tank_purchases")
      .insert({
        user_id: user.id,
        product_key: product.key,
        amount_cents: product.amountCents,
        currency: "usd",
        stripe_mode: mode,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      return { success: false, error: insertError?.message ?? "Failed to start purchase." };
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: product.amountCents,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        description: `Tank — ${product.name}`,
        metadata: {
          payment_lane: "tank",
          tank_purchase_id: purchase.id,
          product_key: product.key,
          user_id: user.id,
        },
      },
      { idempotencyKey: `tank-pi-create-${purchase.id}` },
    );

    await admin
      .from("tank_purchases")
      .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
      .eq("id", purchase.id);

    if (!paymentIntent.client_secret) {
      return { success: false, error: "Stripe did not return a client secret." };
    }

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      purchaseId: purchase.id,
      amountCents: product.amountCents,
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Failed to start checkout." };
  }
}

export async function createTankSubscriptionCheckout(
  productKey: PassProductKey,
): Promise<CreateSubscriptionResult> {
  const product = TANK_PRODUCTS[productKey];
  if (!product?.passTier || !product.monthlyTokens) {
    return { success: false, error: "Unknown subscription tier." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "You must be signed in." };

  const admin = createAdminClient();
  let purchaseId: string | null = null;

  try {
    const { stripe, mode } = createCommerceStripe("tank");
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("stripe_customer_id, stripe_customer_mode, stripe_subscription_id, season_pass_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      profile?.stripe_subscription_id &&
      ["active", "trialing", "past_due"].includes(profile.season_pass_status ?? "")
    ) {
      return {
        success: false,
        error: "You already have a subscription. Subscription management is coming next.",
      };
    }

    const priceId = subscriptionPriceId(productKey, mode);
    const price = await stripe.prices.retrieve(priceId);
    if (
      !price.active ||
      price.livemode !== (mode === "live") ||
      price.currency !== "usd" ||
      price.unit_amount !== product.amountCents ||
      price.recurring?.interval !== "month"
    ) {
      throw new Error(`Stripe price for ${product.name} does not match the Tank catalog`);
    }

    const { data: purchase, error: insertError } = await admin
      .from("tank_purchases")
      .insert({
        user_id: user.id,
        product_key: product.key,
        amount_cents: product.amountCents,
        currency: "usd",
        stripe_mode: mode,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !purchase) {
      return { success: false, error: insertError?.message ?? "Failed to start subscription." };
    }
    purchaseId = purchase.id;

    const metadata = {
      payment_lane: "tank",
      tank_purchase_id: purchase.id,
      product_key: product.key,
      user_id: user.id,
      pass_tier: product.passTier,
    };
    const origin = tankPublicOrigin();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        ui_mode: "embedded",
        line_items: [{ price: priceId, quantity: 1 }],
        // Where Stripe sends the viewer AFTER payment completes in-page. Not a
        // redirect away to pay — the form itself is mounted inside Tank.
        return_url: `${origin}/?tank_checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
        client_reference_id: user.id,
        // A cus_ from the other mode does not exist here: passing a test
        // customer to the live API fails the whole checkout with "No such
        // customer". Fall back to customer_email and let Stripe make a new
        // one for this mode.
        ...(profile?.stripe_customer_id && profile?.stripe_customer_mode === mode
          ? { customer: profile.stripe_customer_id }
          : user.email
            ? { customer_email: user.email }
            : {}),
        metadata,
        subscription_data: { metadata },
      },
      { idempotencyKey: `tank-subscription-checkout-${purchase.id}` },
    );

    if (!session.client_secret) {
      throw new Error("Stripe did not return an embedded checkout client secret");
    }

    await admin
      .from("tank_purchases")
      .update({
        stripe_checkout_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchase.id);

    return { success: true, clientSecret: session.client_secret, purchaseId: purchase.id };
  } catch (error: any) {
    if (purchaseId) {
      await admin
        .from("tank_purchases")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", purchaseId)
        .eq("status", "pending");
    }
    return { success: false, error: error?.message ?? "Failed to start subscription." };
  }
}
