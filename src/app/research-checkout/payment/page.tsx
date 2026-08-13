// app/research-checkout/payment/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Lock } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentForm({ orderId }: { orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage("");

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/research-checkout/confirmation/${orderId}`,
      },
    });

    if (error) {
      setErrorMessage(error.message || "Payment failed");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {errorMessage && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={!stripe || isProcessing}>
        <Lock className="w-4 h-4 mr-2" />
        {isProcessing ? "Processing..." : "Pay Now"}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Your payment information is secure and encrypted
      </p>
    </form>
  );
}

export default function ResearchCheckoutPaymentPage() {
  const router = useRouter();
  const { cart, itemCount, isSignedIn, isLoading: cartLoading } = useResearchCart();

  const [clientSecret, setClientSecret] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutData, setCheckoutData] = useState<any>(null);

  useEffect(() => {
    if (cartLoading) return;
    if (!isSignedIn) {
      router.push(`/sign-in?next=${encodeURIComponent("/research-checkout/payment")}`);
      return;
    }

    // Root-caused 2026-08-08: on a hard reload of this page, sessionStorage's
    // "rx_checkout_email" and "rx_checkout_shipping_rate_id" keys were
    // observed to reliably come back null (reproduced via location.reload()
    // AND a real F5 keypress, 3/3 times) while "rx_checkout_shipping_address"
    // and "rx_checkout_shipping_rate_data" always survived — no app code
    // anywhere clears just those two keys, so this looks like a browser/
    // session-storage flush quirk on this specific key pair rather than a
    // logic bug we can "fix" by finding a missing removeItem call.
    //
    // Fix: stop depending on the two keys that vanish.
    //  - email: research-checkout's create-payment-intent route already
    //    ignores whatever email the client sends and re-resolves it from
    //    the authenticated user server-side (see route.ts — the destructured
    //    body doesn't even include `email`), so round-tripping it through
    //    sessionStorage was pure redundancy.
    //  - shipping_rate_id: shipping/page.tsx's rate_data payload already
    //    includes `id: rateData.id`, identical to what rate_id held — so it
    //    can be read out of rate_data instead of a second, independently
    //    fragile key.
    const shippingAddress = sessionStorage.getItem("rx_checkout_shipping_address");
    const shippingRateDataRaw = sessionStorage.getItem("rx_checkout_shipping_rate_data");
    const shippingRateData = shippingRateDataRaw ? JSON.parse(shippingRateDataRaw) : null;
    const marketingOptIn = sessionStorage.getItem("rx_checkout_marketing_opt_in") === "true";

    if (!shippingAddress || !shippingRateData?.id || !cart?.id) {
      router.push("/research-checkout");
      return;
    }

    setCheckoutData({
      shipping_address: JSON.parse(shippingAddress),
      billing_address: JSON.parse(shippingAddress),
      shipping_rate_id: shippingRateData.id,
      shipping_rate_data: shippingRateData,
      marketing_opt_in: marketingOptIn,
    });
  }, [cart, cartLoading, isSignedIn, router]);

  useEffect(() => {
    if (!checkoutData || !cart?.id) return;
    createPaymentIntent();
  }, [checkoutData, cart]);

  const createPaymentIntent = async () => {
    try {
      const response = await fetch("/api/research-checkout/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: cart?.id,
          ...checkoutData,
        }),
      });

      const data = await response.json();

      if (data.success && data.payment_intent) {
        setClientSecret(data.payment_intent.client_secret);
        setOrderId(data.order.id);
      } else {
        setError(data.error || "Failed to create payment intent");
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize payment");
    } finally {
      setLoading(false);
    }
  };

  if (itemCount === 0 && !cartLoading) {
    router.push("/");
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Preparing checkout...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => router.push("/research-checkout")}>Return to Cart</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-2xl font-bold">Unenter Labs</Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link
          href="/research-checkout/shipping"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Shipping
        </Link>

        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Payment</h1>
            <p className="text-muted-foreground">Complete your order securely</p>
          </div>

          {clientSecret && (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm orderId={orderId} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}
