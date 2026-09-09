// app/research-checkout/payment/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ChevronLeft, Lock, ShieldCheck, Copy, Check, AlertTriangle, CreditCard } from "lucide-react";
import { useStripeLane } from "@/lib/stripe/useStripeLane";

function StripePaymentForm({ orderId, totalFormatted }: { orderId: string; totalFormatted: string }) {
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />

      {errorMessage && (
        <div className="rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.1)] p-4 text-xs font-semibold text-[hsl(var(--destructive))]">
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full h-12 font-bold tracking-wide rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md hover:opacity-90 active:scale-[0.99] transition"
        disabled={!stripe || isProcessing}
      >
        <Lock className="w-4 h-4 mr-2" />
        {isProcessing ? "Processing Payment..." : `Pay Now — ${totalFormatted}`}
      </Button>

      <p className="text-xs text-center text-[hsl(var(--muted-foreground))]">
        Your payment information is encrypted and processed directly via Stripe
      </p>
    </form>
  );
}

export default function ResearchCheckoutPaymentPage() {
  const stripeLane = useStripeLane("labs");
  const router = useRouter();
  const { cart, items, itemCount, subtotal, isSignedIn, isLoading: cartLoading } = useResearchCart();

  const [clientSecret, setClientSecret] = useState("");
  const [stripeOrderId, setStripeOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutData, setCheckoutData] = useState<any>(null);

  // Billing address state
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [billingAddress, setBillingAddress] = useState({
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
  });

  // Package protection state (default checked as per reference screenshot)
  const [packageProtection, setPackageProtection] = useState(true);

  // Payment method selection
  const [paymentMethod, setPaymentMethod] = useState<"card" | "zelle">("zelle");
  const [isSubmittingZelle, setIsSubmittingZelle] = useState(false);
  const [copiedZelle, setCopiedZelle] = useState(false);

  useEffect(() => {
    if (cartLoading) return;
    if (!isSignedIn) {
      router.push(`/sign-in?next=${encodeURIComponent("/research-checkout/payment")}`);
      return;
    }

    const shippingAddressRaw = sessionStorage.getItem("rx_checkout_shipping_address");
    const shippingRateDataRaw = sessionStorage.getItem("rx_checkout_shipping_rate_data");
    const shippingRateData = shippingRateDataRaw ? JSON.parse(shippingRateDataRaw) : null;
    const marketingOptIn = sessionStorage.getItem("rx_checkout_marketing_opt_in") === "true";

    if (!shippingAddressRaw || !shippingRateData?.id || !cart?.id) {
      router.push("/research-checkout");
      return;
    }

    const parsedShipping = JSON.parse(shippingAddressRaw);
    setCheckoutData({
      shipping_address: parsedShipping,
      billing_address: parsedShipping,
      shipping_rate_id: shippingRateData.id,
      shipping_rate_data: shippingRateData,
      marketing_opt_in: marketingOptIn,
    });

    setBillingAddress({
      firstName: parsedShipping.firstName || "",
      lastName: parsedShipping.lastName || "",
      address1: parsedShipping.address1 || "",
      address2: parsedShipping.address2 || "",
      city: parsedShipping.city || "",
      state: parsedShipping.state || "",
      zip: parsedShipping.zip || "",
      country: "US",
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
        setStripeOrderId(data.order.id);
      } else {
        // Stripe error is non-fatal if user wants to pay with Zelle
        console.warn("Stripe PI init warning:", data.error);
      }
    } catch (err: any) {
      console.warn("Failed to initialize Stripe payment intent:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // Financial calculations
  const subtotalCents = subtotal;
  const shippingCents = checkoutData?.shipping_rate_data?.price_cents ?? 0;
  // Package protection formula: $2.00 for orders <= $100, or 3% of subtotal for orders > $100
  const protectionCents = packageProtection
    ? subtotalCents <= 10000
      ? 200
      : Math.round(subtotalCents * 0.03)
    : 0;
  const totalCents = subtotalCents + shippingCents + protectionCents;
  const totalFormatted = `$${(totalCents / 100).toFixed(2)}`;

  const handleCopyZelle = () => {
    navigator.clipboard.writeText("labs@unenter.live");
    setCopiedZelle(true);
    setTimeout(() => setCopiedZelle(false), 2000);
  };

  const handleZelleSubmit = async () => {
    if (!cart?.id || !checkoutData) return;

    setIsSubmittingZelle(true);
    setError("");

    try {
      const effectiveBilling = sameAsShipping ? checkoutData.shipping_address : billingAddress;

      const res = await fetch("/api/research-checkout/create-offline-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cart_id: cart.id,
          shipping_address: checkoutData.shipping_address,
          billing_address: effectiveBilling,
          shipping_rate_id: checkoutData.shipping_rate_id,
          shipping_rate_data: checkoutData.shipping_rate_data,
          marketing_opt_in: checkoutData.marketing_opt_in,
          package_protection: packageProtection,
        }),
      });

      const data = await res.json();

      if (data.success && data.order?.id) {
        router.push(`/research-checkout/confirmation/${data.order.id}`);
      } else {
        setError(data.error || "Failed to submit offline order. Please try again.");
        setIsSubmittingZelle(false);
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred while placing your order.");
      setIsSubmittingZelle(false);
    }
  };

  if (itemCount === 0 && !cartLoading) {
    router.push("/");
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--primary))] mx-auto mb-4" />
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">Preparing checkout portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      {/* Top Header */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight text-[hsl(var(--card-foreground))]">
            Unenter Labs
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            <ShieldCheck className="h-4 w-4 text-[hsl(var(--primary))]" />
            Secure Clinical Checkout
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Link
          href="/research-checkout/shipping"
          className="inline-flex items-center text-xs font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] mb-6 transition"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Shipping
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Form Area */}
          <div className="lg:col-span-7 space-y-8">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-[hsl(var(--card-foreground))]">
                Payment & Billing
              </h1>
              <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
                Choose your preferred payment method and confirm your billing details.
              </p>
            </div>

            {/* ══════════════════ BILLING ADDRESS ══════════════════ */}
            <div className="space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Billing Address
              </h2>
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="billing-same"
                    checked={sameAsShipping}
                    onCheckedChange={(checked) => setSameAsShipping(checked === true)}
                  />
                  <Label htmlFor="billing-same" className="text-sm font-semibold text-[hsl(var(--card-foreground))] cursor-pointer">
                    Same as shipping address
                  </Label>
                </div>

                {!sameAsShipping && (
                  <div className="pt-4 border-t border-[hsl(var(--border))] space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="b-first" className="text-xs text-[hsl(var(--muted-foreground))]">First Name</Label>
                        <Input
                          id="b-first"
                          value={billingAddress.firstName}
                          onChange={(e) => setBillingAddress({ ...billingAddress, firstName: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="b-last" className="text-xs text-[hsl(var(--muted-foreground))]">Last Name</Label>
                        <Input
                          id="b-last"
                          value={billingAddress.lastName}
                          onChange={(e) => setBillingAddress({ ...billingAddress, lastName: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="b-addr1" className="text-xs text-[hsl(var(--muted-foreground))]">Street Address</Label>
                      <Input
                        id="b-addr1"
                        value={billingAddress.address1}
                        onChange={(e) => setBillingAddress({ ...billingAddress, address1: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="b-addr2" className="text-xs text-[hsl(var(--muted-foreground))]">Apt, Suite, Unit (optional)</Label>
                      <Input
                        id="b-addr2"
                        value={billingAddress.address2}
                        onChange={(e) => setBillingAddress({ ...billingAddress, address2: e.target.value })}
                        className="mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label htmlFor="b-city" className="text-xs text-[hsl(var(--muted-foreground))]">City</Label>
                        <Input
                          id="b-city"
                          value={billingAddress.city}
                          onChange={(e) => setBillingAddress({ ...billingAddress, city: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="b-state" className="text-xs text-[hsl(var(--muted-foreground))]">State</Label>
                        <Input
                          id="b-state"
                          value={billingAddress.state}
                          onChange={(e) => setBillingAddress({ ...billingAddress, state: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="b-zip" className="text-xs text-[hsl(var(--muted-foreground))]">ZIP</Label>
                        <Input
                          id="b-zip"
                          value={billingAddress.zip}
                          onChange={(e) => setBillingAddress({ ...billingAddress, zip: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ══════════════════ PAYMENT METHOD ══════════════════ */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Payment Method
              </h2>

              {/* Package Protection Card (matching reference screenshot) */}
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[hsl(var(--card-foreground))]">
                    Package Protection
                  </h3>
                  <span className="text-xs font-bold text-[hsl(var(--primary))] tabular-nums">
                    {packageProtection ? (subtotalCents <= 10000 ? "$2.00" : `$${(protectionCents / 100).toFixed(2)}`) : "Optional"}
                  </span>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                  Optional package protection gives you peace of mind. If your order is lost, stolen, or damaged, we'll take care of it—fast and hassle-free.
                  <br />
                  <span className="opacity-80">
                    Cost: $2.00 for orders up to $100, or 3% of the order total for orders over $100 (after discounts, before shipping and tax).
                  </span>
                </p>

                <div className="pt-2">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="package-protection"
                      checked={packageProtection}
                      onCheckedChange={(checked) => setPackageProtection(checked === true)}
                    />
                    <Label htmlFor="package-protection" className="text-xs font-bold text-[hsl(var(--card-foreground))] cursor-pointer">
                      Add Package Protection to this order
                    </Label>
                  </div>
                  <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-2 italic">
                    Please note: If shipping protection is left unchecked, we cannot be held responsible for lost, stolen, or damaged packages.
                  </p>
                </div>
              </div>

              {/* Payment Methods Radio Group */}
              <RadioGroup
                value={paymentMethod}
                onValueChange={(val: any) => setPaymentMethod(val)}
                className="gap-3"
              >
                {/* Method 1: Credit Card / Digital Wallet via Stripe */}
                <div
                  onClick={() => setPaymentMethod("card")}
                  className={`rounded-xl border p-4.5 cursor-pointer transition ${
                    paymentMethod === "card"
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.04)] shadow-sm"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.2)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="card" id="pm-card" />
                      <div>
                        <Label htmlFor="pm-card" className="text-sm font-bold text-[hsl(var(--card-foreground))] cursor-pointer">
                          Credit Card Payments (Mastercard Not Accepted)
                        </Label>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
                          Use Your Credit/Debit Card, Apple Pay or Google Pay ($2000 maximum)
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[hsl(var(--card-foreground))]">
                        VISA
                      </span>
                      <span className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[hsl(var(--card-foreground))]">
                        AMEX
                      </span>
                      <span className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.5)] px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[hsl(var(--card-foreground))]">
                        DISCOVER
                      </span>
                    </div>
                  </div>

                  {paymentMethod === "card" && (
                    <div className="mt-5 pt-4 border-t border-[hsl(var(--border))]">
                      {clientSecret && stripeOrderId && stripeLane.stripe ? (
                        <Elements stripe={stripeLane.stripe} options={{ clientSecret }}>
                          <StripePaymentForm orderId={stripeOrderId} totalFormatted={totalFormatted} />
                        </Elements>
                      ) : stripeLane.error ? (
                        <div className="py-6 text-center text-xs text-destructive">{stripeLane.error}</div>
                      ) : (
                        <div className="py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[hsl(var(--primary))] mx-auto mb-2" />
                          Loading card form...
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Method 2: Zelle (Offline Payment) */}
                <div
                  onClick={() => setPaymentMethod("zelle")}
                  className={`rounded-xl border p-4.5 cursor-pointer transition ${
                    paymentMethod === "zelle"
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--card))] shadow-sm"
                      : "border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.2)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="zelle" id="pm-zelle" />
                      <Label htmlFor="pm-zelle" className="text-sm font-bold text-[hsl(var(--card-foreground))] cursor-pointer">
                        Zelle
                      </Label>
                    </div>
                    <span className="rounded-full border border-[hsl(var(--primary)/0.3)] bg-[hsl(var(--primary)/0.12)] px-2.5 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                      Offline Payment
                    </span>
                  </div>

                  {paymentMethod === "zelle" && (
                    <div className="mt-4 pt-4 border-t border-[hsl(var(--border))] space-y-4">
                      {/* Offline Payment Instructions Container (styled strictly after reference) */}
                      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-5 space-y-4">
                        <div className="flex items-center gap-2 text-base font-extrabold text-[hsl(var(--card-foreground))]">
                          <span>💳</span>
                          <h3>Offline Payment Instructions</h3>
                        </div>

                        <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                          Please submit your order first, then send your payment using one of the following methods:
                        </p>

                        <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3.5 flex items-center justify-between">
                          <div className="text-xs font-semibold text-[hsl(var(--card-foreground))]">
                            <span className="text-[hsl(var(--muted-foreground))]">Zelle:</span>{" "}
                            <span className="font-mono text-sm text-[hsl(var(--primary))] font-bold">
                              labs@unenter.live
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyZelle();
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--card-foreground))] hover:bg-[hsl(var(--muted))] transition"
                          >
                            {copiedZelle ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
                                Copy
                              </>
                            )}
                          </button>
                        </div>

                        {/* Requirements Box */}
                        <div className="space-y-2 text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-[hsl(var(--foreground))]">
                            <span>⚠️</span>
                            <span>Important Payment Requirements:</span>
                          </div>
                          <ul className="space-y-1.5 pl-4 list-disc text-[hsl(var(--muted-foreground))] leading-relaxed">
                            <li>All payments must be sent using the “Friends & Family” option.</li>
                            <li>Payments sent as “Goods & Services” will be voided and refunded.</li>
                            <li>Include your order number in the payment notes, nothing else.</li>
                            <li>Your order will not begin processing until payment has been received and verified.</li>
                          </ul>
                        </div>

                        <p className="text-xs text-[hsl(var(--muted-foreground))] italic border-t border-[hsl(var(--border))] pt-3">
                          Once payment is confirmed, you’ll receive an email notification and your order will move into processing.
                        </p>
                      </div>

                      {error && (
                        <div className="rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.1)] p-4 text-xs font-semibold text-[hsl(var(--destructive))]">
                          {error}
                        </div>
                      )}

                      <Button
                        type="button"
                        onClick={handleZelleSubmit}
                        disabled={isSubmittingZelle}
                        size="lg"
                        className="w-full h-12 font-bold tracking-wide rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-md hover:opacity-90 active:scale-[0.99] transition"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        {isSubmittingZelle ? "Submitting Order..." : `Submit Order (Pay with Zelle) — ${totalFormatted}`}
                      </Button>
                    </div>
                  )}
                </div>
              </RadioGroup>

              {/* Bottom Support Notice (matching reference) */}
              <div className="pt-2 text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                We provide a variety of payment options so you can choose what works best for you. If you select a method and it does not go through or is not convenient, please email us at{" "}
                <a href="mailto:labs@unenter.live" className="text-[hsl(var(--primary))] font-semibold hover:underline">
                  labs@unenter.live
                </a>{" "}
                and we will help you switch to the option that fits your needs.
              </div>
            </div>
          </div>

          {/* Sidebar Order Summary */}
          <div className="lg:col-span-5 space-y-5">
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--card-foreground))]">
                Order Summary
              </h2>

              <div className="divide-y divide-[hsl(var(--border))]">
                {items.map((item) => (
                  <div key={item.id} className="py-3 flex justify-between text-xs">
                    <div>
                      <p className="font-semibold text-[hsl(var(--card-foreground))]">{item.title}</p>
                      {item.variant_title && item.variant_title !== "Default" && (
                        <p className="text-[hsl(var(--muted-foreground))] text-[11px]">{item.variant_title}</p>
                      )}
                      <p className="text-[hsl(var(--muted-foreground))] mt-0.5">Qty: {item.quantity}</p>
                    </div>
                    <span className="font-bold text-[hsl(var(--card-foreground))] tabular-nums">
                      ${((item.price_cents * item.quantity) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[hsl(var(--border))] space-y-2 text-xs">
                <div className="flex justify-between text-[hsl(var(--muted-foreground))]">
                  <span>Subtotal</span>
                  <span className="text-[hsl(var(--card-foreground))] font-semibold tabular-nums">
                    ${(subtotalCents / 100).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-[hsl(var(--muted-foreground))]">
                  <span>Shipping ({checkoutData?.shipping_rate_data?.name || "Standard"})</span>
                  <span className="text-[hsl(var(--card-foreground))] font-semibold tabular-nums">
                    {shippingCents === 0 ? "Free" : `$${(shippingCents / 100).toFixed(2)}`}
                  </span>
                </div>

                {packageProtection && (
                  <div className="flex justify-between text-[hsl(var(--muted-foreground))]">
                    <span>Package Protection</span>
                    <span className="text-[hsl(var(--primary))] font-semibold tabular-nums">
                      +${(protectionCents / 100).toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="pt-3 border-t border-[hsl(var(--border))] flex justify-between text-base font-extrabold text-[hsl(var(--card-foreground))]">
                  <span>Total</span>
                  <span className="text-[hsl(var(--primary))] tabular-nums">{totalFormatted}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address Recap Card */}
            {checkoutData?.shipping_address && (
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm space-y-1 text-xs text-[hsl(var(--muted-foreground))]">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold uppercase tracking-wider text-[hsl(var(--card-foreground))]">
                    Shipping To
                  </span>
                  <Link href="/research-checkout/shipping" className="text-[hsl(var(--primary))] font-semibold hover:underline">
                    Edit
                  </Link>
                </div>
                <p className="font-semibold text-[hsl(var(--card-foreground))]">
                  {checkoutData.shipping_address.firstName} {checkoutData.shipping_address.lastName}
                </p>
                <p>{checkoutData.shipping_address.address1}</p>
                {checkoutData.shipping_address.address2 && <p>{checkoutData.shipping_address.address2}</p>}
                <p>
                  {[checkoutData.shipping_address.city, checkoutData.shipping_address.state, checkoutData.shipping_address.zip]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
