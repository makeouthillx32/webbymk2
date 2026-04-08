// app/api/pos/connection-token/route.ts
//
// POST /api/pos/connection-token
// Returns a Stripe Terminal connection token secret.
// Called by the Terminal JS SDK whenever it needs to authenticate.
// Protected by the dashboard layout — no additional auth check needed.

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

export async function POST() {
  try {
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