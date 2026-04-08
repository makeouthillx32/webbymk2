// components/POS/Checkout/index.tsx
"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { POSCartItem } from "../types";
import "./styles.scss";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutProps {
  items: POSCartItem[];
  clientSecret: string;
  orderId: string;
  orderNumber: string;
  totalCents: number;
  onBack: () => void;
  onSuccess: () => void;
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Inner form (needs Stripe context) ─────────────────────────────────────────
function PaymentForm({
  items,
  totalCents,
  orderId,
  orderNumber,
  onBack,
  onSuccess,
}: Omit<CheckoutProps, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    if (!stripe || !elements) return;
    setIsProcessing(true);
    setError(null);

    // Validate the Elements form first
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Please check your payment details.");
      setIsProcessing(false);
      return;
    }

    const { paymentIntent, error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Please try again.");
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      onSuccess();
    } else {
      setError(`Unexpected status: ${paymentIntent?.status}`);
      setIsProcessing(false);
    }
  }

  return (
    <div className="pos-checkout">
      {/* Back */}
      <button type="button" className="pos-checkout__back" onClick={onBack}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Back to cart
      </button>

      <h2 className="pos-checkout__title">Collect Payment</h2>

      {/* Order summary */}
      <div className="pos-checkout__summary">
        <p className="pos-checkout__summary-label">{orderNumber}</p>
        <div className="pos-checkout__summary-items">
          {items.map((item) => (
            <div key={item.key} className="pos-checkout__summary-row">
              <span className="pos-checkout__summary-name">
                {item.product_title}
                {item.variant_title && item.variant_title !== "Default" && item.variant_title !== ""
                  ? ` — ${item.variant_title}` : ""}
                <span className="pos-checkout__summary-qty"> ×{item.quantity}</span>
              </span>
              <span className="pos-checkout__summary-price">
                {fmtPrice(item.price_cents * item.quantity)}
              </span>
            </div>
          ))}
        </div>
        <div className="pos-checkout__summary-total">
          <span>Total</span>
          <span>{fmtPrice(totalCents)}</span>
        </div>
      </div>

      {/* Stripe Elements */}
      <div className="pos-checkout__stripe">
        <PaymentElement
          options={{
            layout: { type: "tabs" },
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="pos-checkout__error" role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {/* Pay button */}
      <button
        type="button"
        className="pos-checkout__pay-btn"
        onClick={handlePay}
        disabled={!stripe || !elements || isProcessing}
      >
        {isProcessing ? (
          <>
            <span className="pos-checkout__spinner" />
            Processing…
          </>
        ) : (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Pay {fmtPrice(totalCents)}
          </>
        )}
      </button>
    </div>
  );
}

// ── Public export: wraps with Stripe Elements provider ────────────────────────
export function Checkout({ clientSecret, ...props }: CheckoutProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "hsl(0, 0%, 9%)",
            colorBackground: "hsl(var(--card))",
            borderRadius: "8px",
            fontSizeBase: "14px",
          },
        },
      }}
    >
      <PaymentForm {...props} />
    </Elements>
  );
}