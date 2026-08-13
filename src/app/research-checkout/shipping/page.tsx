// app/research-checkout/shipping/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@/utils/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, Truck } from "lucide-react";

interface ShippingRate {
  id: string;
  name: string;
  description: string;
  carrier: string;
  price_cents: number;
  min_delivery_days: number;
  max_delivery_days: number;
}

export default function ResearchCheckoutShippingPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, cart, isSignedIn, isLoading: cartLoading } = useResearchCart();

  const formRef = useRef<HTMLFormElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const address1Ref = useRef<HTMLInputElement>(null);
  const address2Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [shippingAddress, setShippingAddress] = useState({
    firstName: "", lastName: "", address1: "", address2: "",
    city: "", state: "", zip: "", country: "US", phone: "",
  });

  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedShippingRate, setSelectedShippingRate] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);

  const [taxCents, setTaxCents] = useState(0);
  const [loadingTax, setLoadingTax] = useState(false);
  // Opt-in, not opt-out — feeds profiles.marketing_opt_in via
  // create-payment-intent (research checkout is always a signed-in member).
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  // ── Pre-fill contact info from the signed-in researcher's account ──
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .single();

      const resolvedEmail = profile?.email ?? user.email ?? "";
      const resolvedFirst = profile?.first_name ?? "";
      const resolvedLast = profile?.last_name ?? "";

      setEmail(resolvedEmail);
      setShippingAddress((prev) => ({
        ...prev,
        firstName: prev.firstName || resolvedFirst,
        lastName: prev.lastName || resolvedLast,
      }));

      if (firstNameRef.current && !firstNameRef.current.value) firstNameRef.current.value = resolvedFirst;
      if (lastNameRef.current && !lastNameRef.current.value) lastNameRef.current.value = resolvedLast;
    });
  }, []);

  useEffect(() => {
    if (cartLoading) return;
    if (!isSignedIn) {
      router.push(`/sign-in?next=${encodeURIComponent("/research-checkout/shipping")}`);
      return;
    }
    if (itemCount === 0) {
      router.push("/research-checkout");
    }
  }, [cartLoading, isSignedIn, itemCount, router]);

  useEffect(() => {
    if (shippingAddress.state && shippingAddress.zip.length === 5 && subtotal > 0) {
      loadShippingRates();
    }
  }, [shippingAddress.state, shippingAddress.zip, subtotal]);

  useEffect(() => {
    if (selectedShippingRate && shippingAddress.state) {
      calculateTax();
    }
  }, [selectedShippingRate, shippingAddress.state]);

  const loadShippingRates = async () => {
    setLoadingRates(true);
    try {
      const response = await fetch("/api/research-checkout/shipping-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtotal_cents: subtotal,
          state: shippingAddress.state,
          zip: shippingAddress.zip,
          cart_id: cart?.id,
        }),
      });

      const data = await response.json();
      setShippingRates(data.shipping_rates || []);

      if (data.shipping_rates && data.shipping_rates.length > 0) {
        setSelectedShippingRate(data.shipping_rates[0].id);
      }
    } catch (error) {
      console.error("Failed to load shipping rates:", error);
    } finally {
      setLoadingRates(false);
    }
  };

  const calculateTax = async () => {
    const selectedRate = shippingRates.find((r) => r.id === selectedShippingRate);
    if (!selectedRate) return;

    setLoadingTax(true);
    try {
      const response = await fetch("/api/checkout/calculate-tax", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subtotal_cents: subtotal,
          shipping_cents: selectedRate.price_cents,
          state: shippingAddress.state,
        }),
      });

      const data = await response.json();
      setTaxCents(data.tax_cents || 0);
    } catch (error) {
      console.error("Failed to calculate tax:", error);
    } finally {
      setLoadingTax(false);
    }
  };

  const handleContinue = () => {
    const currentShippingAddress = {
      firstName: firstNameRef.current?.value || shippingAddress.firstName,
      lastName: lastNameRef.current?.value || shippingAddress.lastName,
      address1: address1Ref.current?.value || shippingAddress.address1,
      address2: address2Ref.current?.value || shippingAddress.address2,
      city: cityRef.current?.value || shippingAddress.city,
      state: (stateRef.current?.value || shippingAddress.state).toUpperCase(),
      zip: zipRef.current?.value || shippingAddress.zip,
      country: "US",
      phone: phoneRef.current?.value || shippingAddress.phone,
    };

    if (
      !email ||
      !currentShippingAddress.firstName ||
      !currentShippingAddress.lastName ||
      !currentShippingAddress.address1 ||
      !currentShippingAddress.city ||
      !currentShippingAddress.state ||
      !currentShippingAddress.zip
    ) {
      alert("Please fill in all required fields");
      return;
    }

    if (!selectedShippingRate) {
      alert("Please select a shipping method");
      return;
    }

    // rx_checkout_email is no longer written — the payment page derives email
    // server-side from the authenticated user instead (see the comment in
    // research-checkout/payment/page.tsx, root-caused 2026-08-08).
    sessionStorage.setItem("rx_checkout_shipping_address", JSON.stringify(currentShippingAddress));
    sessionStorage.setItem("rx_checkout_shipping_rate_id", selectedShippingRate);
    sessionStorage.setItem("rx_checkout_marketing_opt_in", marketingOptIn ? "true" : "false");

    const rateData = shippingRates.find((r) => r.id === selectedShippingRate);
    if (rateData) {
      sessionStorage.setItem("rx_checkout_shipping_rate_data", JSON.stringify({
        id: rateData.id,
        name: rateData.name,
        price_cents: rateData.price_cents,
      }));
    }

    router.push("/research-checkout/payment");
  };

  const selectedRate = shippingRates.find((r) => r.id === selectedShippingRate);
  const shippingCents = selectedRate?.price_cents || 0;
  const totalCents = subtotal + shippingCents + taxCents;

  if (itemCount === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-2xl font-bold">
            Unenter Labs
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link
          href="/research-checkout"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Cart
        </Link>

        <form ref={formRef} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Shipping Information</h1>
              <p className="text-muted-foreground">Where should we send your order?</p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Contact</h2>
              <div>
                <Label htmlFor="email">
                  Email Address *
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    (linked to your researcher account)
                  </span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  readOnly
                  className="bg-muted text-muted-foreground cursor-not-allowed"
                />
              </div>
              <div className="flex items-start space-x-2 pt-1">
                <Checkbox
                  id="marketingOptIn"
                  checked={marketingOptIn}
                  onCheckedChange={(checked) => setMarketingOptIn(checked as boolean)}
                />
                <Label htmlFor="marketingOptIn" className="cursor-pointer font-normal text-sm leading-snug">
                  Yes, send me promotional emails about new products, restocks, and offers
                </Label>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Shipping Address</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    ref={firstNameRef}
                    id="firstName"
                    name="given-name"
                    autoComplete="given-name"
                    defaultValue={shippingAddress.firstName}
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, firstName: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    ref={lastNameRef}
                    id="lastName"
                    name="family-name"
                    autoComplete="family-name"
                    defaultValue={shippingAddress.lastName}
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, lastName: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="address1">Address *</Label>
                <Input
                  ref={address1Ref}
                  id="address1"
                  name="address-line1"
                  autoComplete="address-line1"
                  onBlur={(e) => setShippingAddress((prev) => ({ ...prev, address1: e.target.value }))}
                  placeholder="Street address"
                  required
                />
              </div>

              <div>
                <Label htmlFor="address2">Apartment, suite, etc. (optional)</Label>
                <Input
                  ref={address2Ref}
                  id="address2"
                  name="address-line2"
                  autoComplete="address-line2"
                  onBlur={(e) => setShippingAddress((prev) => ({ ...prev, address2: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    ref={cityRef}
                    id="city"
                    name="address-level2"
                    autoComplete="address-level2"
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, city: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    ref={stateRef}
                    id="state"
                    name="address-level1"
                    autoComplete="address-level1"
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, state: e.target.value.toUpperCase() }))}
                    placeholder="AZ"
                    maxLength={2}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="zip">ZIP Code *</Label>
                  <Input
                    ref={zipRef}
                    id="zip"
                    name="postal-code"
                    autoComplete="postal-code"
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, zip: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone (optional)</Label>
                  <Input
                    ref={phoneRef}
                    id="phone"
                    name="tel"
                    type="tel"
                    autoComplete="tel"
                    onBlur={(e) => setShippingAddress((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {loadingRates && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Shipping Method
                </h2>
                <p className="text-sm text-muted-foreground animate-pulse">Getting shipping rates...</p>
              </div>
            )}

            {!loadingRates && shippingRates.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Shipping Method
                </h2>

                <RadioGroup value={selectedShippingRate} onValueChange={setSelectedShippingRate}>
                  <div className="space-y-3">
                    {shippingRates.map((rate) => (
                      <div key={rate.id} className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent">
                        <RadioGroupItem value={rate.id} id={rate.id} />
                        <Label htmlFor={rate.id} className="flex-1 cursor-pointer">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{rate.name}</p>
                              <p className="text-sm text-muted-foreground">{rate.description}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {rate.min_delivery_days}-{rate.max_delivery_days} business days
                              </p>
                            </div>
                            <p className="font-semibold">
                              {rate.price_cents === 0 ? "FREE" : `$${(rate.price_cents / 100).toFixed(2)}`}
                            </p>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4 p-6 border rounded-lg bg-card space-y-4">
              <h3 className="font-semibold text-lg">Order Summary</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${(subtotal / 100).toFixed(2)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>
                    {selectedRate
                      ? selectedRate.price_cents === 0
                        ? "FREE"
                        : `$${(selectedRate.price_cents / 100).toFixed(2)}`
                      : "--"}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{loadingTax ? "Calculating..." : `$${(taxCents / 100).toFixed(2)}`}</span>
                </div>
              </div>

              <Separator />

              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>${(totalCents / 100).toFixed(2)}</span>
              </div>

              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={handleContinue}
                disabled={!selectedShippingRate || loadingTax}
              >
                Continue to Payment
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
