// app/checkout/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, X, Tag, ShoppingBag, Lock } from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, removeItem, updateQuantity } = useCart();

  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState<any>(null);
  const [promoError, setPromoError] = useState("");
  const [isValidatingPromo, setIsValidatingPromo] = useState(false);
  const [discountCents, setDiscountCents] = useState(0);

  useEffect(() => {
    if (itemCount === 0) {
      router.push("/shop");
    }
  }, [itemCount, router]);

  // Restore promo from localStorage on mount (survives refresh)
  useEffect(() => {
    const savedCode = localStorage.getItem("dcg_promo_code");
    const savedDiscount = localStorage.getItem("dcg_discount_cents");
    const savedPromo = localStorage.getItem("dcg_promo_data");

    if (savedCode && savedDiscount && savedPromo) {
      try {
        setPromoCode(savedCode);
        setPromoApplied(JSON.parse(savedPromo));
        setDiscountCents(parseInt(savedDiscount, 10));
      } catch {
        // Corrupted data — clear it
        localStorage.removeItem("dcg_promo_code");
        localStorage.removeItem("dcg_discount_cents");
        localStorage.removeItem("dcg_promo_data");
      }
    }
  }, []);

  const subtotalCents = subtotal;
  const totalCents = subtotalCents - discountCents;

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setIsValidatingPromo(true);
    setPromoError("");

    try {
      const response = await fetch("/api/checkout/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode, subtotal_cents: subtotalCents }),
      });
      const data = await response.json();

      if (data.valid) {
        setPromoApplied(data.promo_code);
        setDiscountCents(data.discount_cents);
        setPromoError("");
        // Persist to localStorage so refresh doesn't wipe it
        localStorage.setItem("dcg_promo_code", promoCode);
        localStorage.setItem("dcg_discount_cents", data.discount_cents.toString());
        localStorage.setItem("dcg_promo_data", JSON.stringify(data.promo_code));
      } else {
        setPromoError(data.error);
        setPromoApplied(null);
        setDiscountCents(0);
      }
    } catch {
      setPromoError("Failed to validate promo code");
    } finally {
      setIsValidatingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode("");
    setPromoApplied(null);
    setDiscountCents(0);
    setPromoError("");
    localStorage.removeItem("dcg_promo_code");
    localStorage.removeItem("dcg_discount_cents");
    localStorage.removeItem("dcg_promo_data");
  };

  const handleContinue = () => {
    if (promoApplied) {
      // Keep localStorage AND write to sessionStorage for the rest of checkout
      sessionStorage.setItem("promo_code", promoCode);
      sessionStorage.setItem("discount_cents", discountCents.toString());
    } else {
      sessionStorage.removeItem("promo_code");
      sessionStorage.removeItem("discount_cents");
    }
    router.push("/checkout/shipping");
  };

  if (itemCount === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/shop" className="hover:text-foreground transition-colors">
            Shop
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Cart</span>
        </nav>

        {/* Page Title */}
        <div className="flex items-center gap-3 mb-8">
          <ShoppingBag className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-bold leading-tight">Your Cart</h1>
            <p className="text-sm text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left — Cart Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 p-4 border rounded-xl bg-card hover:border-border/80 transition-colors"
              >
                {/* Thumbnail */}
                <div className="relative w-20 h-20 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.product_title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">
                        {item.product_title}
                      </h3>
                      {item.variant_title && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.variant_title}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(item.id)}
                      className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between mt-3">
                    {/* Qty Controls */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-xs"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        −
                      </Button>
                      <span className="w-8 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-xs"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={item.quantity >= 99}
                      >
                        +
                      </Button>
                    </div>

                    {/* Price */}
                    <div className="text-right">
                      <p className="font-semibold text-sm">
                        ${((item.price_cents * item.quantity) / 100).toFixed(2)}
                      </p>
                      {item.quantity > 1 && (
                        <p className="text-xs text-muted-foreground">
                          ${(item.price_cents / 100).toFixed(2)} ea.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Continue Shopping */}
            <Link
              href="/shop"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
            >
              ← Continue Shopping
            </Link>
          </div>

          {/* Right — Summary */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">

              {/* Promo Code */}
              <div className="p-5 border rounded-xl bg-card">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Promo Code
                </h3>

                {!promoApplied ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter code"
                        value={promoCode}
                        onChange={(e) =>
                          setPromoCode(e.target.value.toUpperCase())
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleApplyPromo()
                        }
                        className="h-9 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={handleApplyPromo}
                        disabled={isValidatingPromo || !promoCode.trim()}
                        className="shrink-0"
                      >
                        {isValidatingPromo ? "..." : "Apply"}
                      </Button>
                    </div>
                    {promoError && (
                      <p className="text-xs text-destructive">{promoError}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div>
                      <p className="font-semibold text-sm text-green-700 dark:text-green-300">
                        {promoApplied.code}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        {promoApplied.description}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRemovePromo}
                      className="h-7 w-7"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Order Summary */}
              <div className="p-5 border rounded-xl bg-card space-y-4">
                <h3 className="font-semibold">Order Summary</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    {promoApplied ? (
                      <div className="text-right">
                        <span className="line-through text-destructive opacity-70">
                          ${(subtotalCents / 100).toFixed(2)}
                        </span>
                        <span className="block font-semibold">
                          ${(totalCents / 100).toFixed(2)}
                        </span>
                      </div>
                    ) : (
                      <span>${(subtotalCents / 100).toFixed(2)}</span>
                    )}
                  </div>

                  {promoApplied && (
                    <>
                      <div className="flex justify-between text-green-600 dark:text-green-400">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {promoApplied.code}
                        </span>
                        <span>−${(discountCents / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between rounded-md bg-green-50 dark:bg-green-950 px-3 py-1.5 text-green-700 dark:text-green-300 font-medium">
                        <span>🎉 You saved</span>
                        <span>${(discountCents / 100).toFixed(2)}</span>
                      </div>
                    </>
                  )}

                  <div className="flex justify-between text-muted-foreground">
                    <span>Shipping</span>
                    <span className="text-xs">Calculated next step</span>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span className="text-xs">Calculated next step</span>
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between font-bold">
                  <span>Estimated Total</span>
                  <span>${(totalCents / 100).toFixed(2)}</span>
                </div>

                <Button size="lg" className="w-full" onClick={handleContinue}>
                  Continue to Shipping
                </Button>

                <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" />
                  Secure checkout
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}