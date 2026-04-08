// app/checkout/payment/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Lock } from "lucide-react";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentForm({ clientSecret, orderId }: { clientSecret: string; orderId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage("");

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/confirmation/${orderId}`,
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

      <Button 
        type="submit" 
        size="lg" 
        className="w-full"
        disabled={!stripe || isProcessing}
      >
        <Lock className="w-4 h-4 mr-2" />
        {isProcessing ? 'Processing...' : 'Pay Now'}
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        Your payment information is secure and encrypted
      </p>
    </form>
  );
}

export default function CheckoutPaymentPage() {
  const router = useRouter();
  const { cart, itemCount, subtotal } = useCart();
  
  const [clientSecret, setClientSecret] = useState("");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [checkoutData, setCheckoutData] = useState<any>(null);

  useEffect(() => {
    const email = sessionStorage.getItem('checkout_email');
    const shippingAddress = sessionStorage.getItem('checkout_shipping_address');
    const billingAddress = sessionStorage.getItem('checkout_billing_address');
    const shippingRateId = sessionStorage.getItem('checkout_shipping_rate_id');
    const shippingRateData = sessionStorage.getItem('checkout_shipping_rate_data');
    const promoCode = sessionStorage.getItem('promo_code');

    if (!email || !shippingAddress || !cart?.id) {
      router.push('/checkout');
      return;
    }

    setCheckoutData({
      email,
      shipping_address: JSON.parse(shippingAddress),
      billing_address: JSON.parse(billingAddress || shippingAddress),
      shipping_rate_id: shippingRateId,
      shipping_rate_data: shippingRateData ? JSON.parse(shippingRateData) : null,
      promo_code: promoCode,
    });
  }, [cart, router]);

  useEffect(() => {
    if (!checkoutData || !cart?.id) return;
    createPaymentIntent();
  }, [checkoutData, cart]);

  const createPaymentIntent = async () => {
    try {
      const response = await fetch('/api/checkout/create-payment-intent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-id': localStorage.getItem('dcg_session_id') || '',
        },
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
        setError(data.error || 'Failed to create payment intent');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  if (itemCount === 0) {
    router.push('/shop');
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
          <Button onClick={() => router.push('/checkout')}>
            Return to Cart
          </Button>
        </div>
      </div>
    );
  }

  const promoDiscount = parseInt(sessionStorage.getItem('discount_cents') || '0');

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-2xl font-bold">Desert Cowgirl</Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Link 
          href="/checkout/shipping"
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
              <PaymentForm clientSecret={clientSecret} orderId={orderId} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}