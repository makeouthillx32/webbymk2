// src/zones/shop/checkout/Page.tsx
// Core: Checkout page — served at shop.unenter.live/checkout
// Client component — cart state lives here.
"use client";

import type { Metadata } from "next";
import { useState } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title:       "Checkout | Shop",
  description: "Complete your purchase.",
};

// ── Placeholder checkout ──────────────────────────────────────────────────────
// TODO: Wire up cart state (Zustand / Context) and payment gateway (Stripe).

export default function CheckoutPage() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <main className="flex-grow flex items-center justify-center py-28">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Order Placed!</h1>
          <p className="text-body-color mb-8">Thank you for your purchase.</p>
          <Link href="/" className="text-primary font-medium hover:underline">
            Back to shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow py-16 md:py-20 lg:py-28">
      <div className="container max-w-2xl">
        <h1 className="text-3xl font-bold mb-8">Checkout</h1>

        {/* TODO: Replace with real cart summary + Stripe Elements */}
        <div className="rounded-sm border border-stroke p-8 dark:border-strokedark text-center">
          <p className="text-body-color mb-6">
            Your cart is empty or checkout is not yet wired up.
          </p>
          <Link href="/" className="text-primary font-medium hover:underline">
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}
