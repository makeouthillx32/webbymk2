"use server";

import Stripe from "stripe";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
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

export async function createTankPurchaseIntent(productKey: TankProductKey): Promise<CreatePurchaseResult> {
  const product = TANK_PRODUCTS[productKey];
  if (!product) return { success: false, error: "Unknown product." };

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
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const { data: purchase, error: insertError } = await admin
      .from("tank_purchases")
      .insert({
        user_id: user.id,
        product_key: product.key,
        amount_cents: product.amountCents,
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
