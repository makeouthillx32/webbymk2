// app/api/pos/connection-token/route.ts
//
// POST /api/pos/connection-token
// Returns a Stripe Terminal connection token secret.
// Called by the Terminal JS SDK whenever it needs to authenticate.
// Protected by the dashboard layout — no additional auth check needed.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createCommerceStripe } from "@/lib/stripe/commerce";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const guard = await requireAdmin();
    if ("error" in guard) return guard.error;

    // Same class of bug found and fixed across the checkout routes via E2E
    // test, 2026-08-06: constructing Stripe outside try/catch means a
    // missing STRIPE_SECRET_KEY throws uncaught instead of returning JSON.
    const { stripe } = createCommerceStripe("pos");
    const token = await stripe.terminal.connectionTokens.create();
    return NextResponse.json({ secret: token.secret });
  } catch (err: any) {
    console.error("[pos/connection-token]", err.message);
    return NextResponse.json(
      { error: "Failed to create connection token" },
      { status: 500 }
    );
  }
}
