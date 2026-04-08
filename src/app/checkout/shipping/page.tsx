// app/checkout/shipping/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@supabase/ssr";
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

export default function CheckoutShippingPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, cart } = useCart();

  // Refs for autofill detection
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const address1Ref = useRef<HTMLInputElement>(null);
  const address2Ref = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const stateRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [isMember, setIsMember] = useState(false);
  const [shippingAddress, setShippingAddress] = useState({
    firstName: "",
    lastName: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    phone: "",
  });
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
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

  // Shipping rates
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [selectedShippingRate, setSelectedShippingRate] = useState<string>("");
  const [loadingRates, setLoadingRates] = useState(false);

  // Tax calculation
  const [taxCents, setTaxCents] = useState(0);
  const [loadingTax, setLoadingTax] = useState(false);

  // Promo discount (client-side only)
  const [promoDiscount, setPromoDiscount] = useState(0);

  // Load promo discount from sessionStorage (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const discount = parseInt(sessionStorage.getItem("discount_cents") || "0");
      setPromoDiscount(discount);
    }
  }, []);

  // ── Pre-fill contact info for authenticated members ────────────
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;

      setIsMember(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("id", user.id)
        .single();

      const resolvedEmail = profile?.email ?? user.email ?? "";
      const resolvedFirst = profile?.first_name ?? "";
      const resolvedLast = profile?.last_name ?? "";

      setEmail((prev) => prev || resolvedEmail);
      setShippingAddress((prev) => ({
        ...prev,
        firstName: prev.firstName || resolvedFirst,
        lastName: prev.lastName || resolvedLast,
      }));

      if (emailRef.current && !emailRef.current.value) {
        emailRef.current.value = resolvedEmail;
      }
      if (firstNameRef.current && !firstNameRef.current.value) {
        firstNameRef.current.value = resolvedFirst;
      }
      if (lastNameRef.current && !lastNameRef.current.value) {
        lastNameRef.current.value = resolvedLast;
      }
    });
  }, []);

  // Redirect if cart is empty
  useEffect(() => {
    if (itemCount === 0) {
      router.push("/shop");
    }
  }, [itemCount, router]);

  // Autofill detection using MutationObserver and polling
  useEffect(() => {
    const checkAutofill = () => {
      if (!isMember && emailRef.current && emailRef.current.value !== email) {
        setEmail(emailRef.current.value);
      }
      if (firstNameRef.current && firstNameRef.current.value !== shippingAddress.firstName) {
        setShippingAddress((prev) => ({ ...prev, firstName: firstNameRef.current!.value }));
      }
      if (lastNameRef.current && lastNameRef.current.value !== shippingAddress.lastName) {
        setShippingAddress((prev) => ({ ...prev, lastName: lastNameRef.current!.value }));
      }
      if (address1Ref.current && address1Ref.current.value !== shippingAddress.address1) {
        setShippingAddress((prev) => ({ ...prev, address1: address1Ref.current!.value }));
      }
      if (address2Ref.current && address2Ref.current.value !== shippingAddress.address2) {
        setShippingAddress((prev) => ({ ...prev, address2: address2Ref.current!.value }));
      }
      if (cityRef.current && cityRef.current.value !== shippingAddress.city) {
        setShippingAddress((prev) => ({ ...prev, city: cityRef.current!.value }));
      }
      if (stateRef.current && stateRef.current.value !== shippingAddress.state) {
        setShippingAddress((prev) => ({
          ...prev,
          state: stateRef.current!.value.toUpperCase(),
        }));
      }
      if (zipRef.current && zipRef.current.value !== shippingAddress.zip) {
        setShippingAddress((prev) => ({ ...prev, zip: zipRef.current!.value }));
      }
      if (phoneRef.current && phoneRef.current.value !== shippingAddress.phone) {
        setShippingAddress((prev) => ({ ...prev, phone: phoneRef.current!.value }));
      }
    };

    const timer = setInterval(checkAutofill, 100);
    setTimeout(checkAutofill, 500);
    setTimeout(checkAutofill, 1000);

    const observer = new MutationObserver(checkAutofill);
    if (formRef.current) {
      observer.observe(formRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["value"],
      });
    }

    return () => {
      clearInterval(timer);
      observer.disconnect();
    };
  }, [email, isMember, shippingAddress]);

  // Load shipping rates when state OR zip changes (zip needed for live USPS rates)
  useEffect(() => {
    if (shippingAddress.state && shippingAddress.zip.length === 5 && subtotal > 0) {
      loadShippingRates();
    }
  }, [shippingAddress.state, shippingAddress.zip, subtotal]);

  // Calculate tax when shipping rate is selected
  useEffect(() => {
    if (selectedShippingRate && shippingAddress.state) {
      calculateTax();
    }
  }, [selectedShippingRate, shippingAddress.state]);

  // Load shipping rates — passes zip + cart_id for live USPS rate quoting
  const loadShippingRates = async () => {
    setLoadingRates(true);
    try {
      const response = await fetch("/api/checkout/shipping-rates", {
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

      // Auto-select first rate
      if (data.shipping_rates && data.shipping_rates.length > 0) {
        setSelectedShippingRate(data.shipping_rates[0].id);
      }
    } catch (error) {
      console.error("Failed to load shipping rates:", error);
    } finally {
      setLoadingRates(false);
    }
  };

  // Calculate tax
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

  // Handle form submission
  const handleContinue = () => {
    const currentEmail = isMember ? email : (emailRef.current?.value || email);
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
      !currentEmail ||
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

    if (typeof window !== "undefined") {
      sessionStorage.setItem("checkout_email", currentEmail);
      sessionStorage.setItem(
        "checkout_shipping_address",
        JSON.stringify(currentShippingAddress)
      );
      sessionStorage.setItem(
        "checkout_billing_address",
        JSON.stringify(billingSameAsShipping ? currentShippingAddress : billingAddress)
      );
      sessionStorage.setItem("checkout_shipping_rate_id", selectedShippingRate);

      // Save full rate data so payment intent can resolve price without a DB lookup
      const rateData = shippingRates.find((r) => r.id === selectedShippingRate);
      if (rateData) {
        sessionStorage.setItem("checkout_shipping_rate_data", JSON.stringify({
          id: rateData.id,
          name: rateData.name,
          price_cents: rateData.price_cents,
        }));
}
    }

    router.push("/checkout/payment");
  };

  const selectedRate = shippingRates.find((r) => r.id === selectedShippingRate);
  const shippingCents = selectedRate?.price_cents || 0;
  const totalCents = subtotal + shippingCents + taxCents - promoDiscount;

  if (itemCount === 0) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-2xl font-bold">
            Desert Cowgirl
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Back Button */}
        <Link
          href="/checkout"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Cart
        </Link>

        <form ref={formRef} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Shipping Form */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Shipping Information</h1>
              <p className="text-muted-foreground">Where should we send your order?</p>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Contact</h2>
              <div>
                <Label htmlFor="email">
                  Email Address *
                  {isMember && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      (linked to your account)
                    </span>
                  )}
                </Label>
                <Input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete={isMember ? "off" : "email"}
                  value={isMember ? email : undefined}
                  defaultValue={isMember ? undefined : email}
                  readOnly={isMember}
                  onBlur={isMember ? undefined : (e) => setEmail(e.target.value)}
                  onChange={isMember ? undefined : (e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className={isMember ? "bg-muted text-muted-foreground cursor-not-allowed" : ""}
                />
              </div>
            </div>

            {/* Shipping Address */}
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
                    value={shippingAddress.firstName}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({ ...prev, firstName: e.target.value }))
                    }
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
                    value={shippingAddress.lastName}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({ ...prev, lastName: e.target.value }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({ ...prev, lastName: e.target.value }))
                    }
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
                  defaultValue={shippingAddress.address1}
                  onBlur={(e) =>
                    setShippingAddress((prev) => ({ ...prev, address1: e.target.value }))
                  }
                  onChange={(e) =>
                    setShippingAddress((prev) => ({ ...prev, address1: e.target.value }))
                  }
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
                  defaultValue={shippingAddress.address2}
                  onBlur={(e) =>
                    setShippingAddress((prev) => ({ ...prev, address2: e.target.value }))
                  }
                  onChange={(e) =>
                    setShippingAddress((prev) => ({ ...prev, address2: e.target.value }))
                  }
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
                    defaultValue={shippingAddress.city}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({ ...prev, city: e.target.value }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({ ...prev, city: e.target.value }))
                    }
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
                    defaultValue={shippingAddress.state}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        state: e.target.value.toUpperCase(),
                      }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({
                        ...prev,
                        state: e.target.value.toUpperCase(),
                      }))
                    }
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
                    defaultValue={shippingAddress.zip}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({ ...prev, zip: e.target.value }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({ ...prev, zip: e.target.value }))
                    }
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
                    defaultValue={shippingAddress.phone}
                    onBlur={(e) =>
                      setShippingAddress((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    onChange={(e) =>
                      setShippingAddress((prev) => ({ ...prev, phone: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            {/* Shipping Method */}
            {loadingRates && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Truck className="w-5 h-5" />
                  Shipping Method
                </h2>
                <p className="text-sm text-muted-foreground animate-pulse">
                  Getting shipping rates...
                </p>
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
                      <div
                        key={rate.id}
                        className="flex items-center space-x-3 p-4 border rounded-lg hover:bg-accent"
                      >
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
                              {rate.price_cents === 0
                                ? "FREE"
                                : `$${(rate.price_cents / 100).toFixed(2)}`}
                            </p>
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Billing Address */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="billingSame"
                  checked={billingSameAsShipping}
                  onCheckedChange={(checked) => setBillingSameAsShipping(checked as boolean)}
                />
                <Label htmlFor="billingSame" className="cursor-pointer">
                  Billing address same as shipping
                </Label>
              </div>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 p-6 border rounded-lg bg-card space-y-4">
              <h3 className="font-semibold text-lg">Order Summary</h3>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${(subtotal / 100).toFixed(2)}</span>
                </div>

                {promoDiscount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Discount</span>
                    <span>-${(promoDiscount / 100).toFixed(2)}</span>
                  </div>
                )}

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
                  <span>
                    {loadingTax ? "Calculating..." : `$${(taxCents / 100).toFixed(2)}`}
                  </span>
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