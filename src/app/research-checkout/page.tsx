// app/research-checkout/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight, X, FlaskConical, Lock } from "lucide-react";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export default function ResearchCheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, removeItem, updateQuantity, isSignedIn, isLoading } = useResearchCart();

  useEffect(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      router.push(`/sign-in?next=${encodeURIComponent("/research-checkout")}`);
      return;
    }
    if (itemCount === 0) {
      router.push("/");
    }
  }, [isLoading, isSignedIn, itemCount, router]);

  const totalCents = subtotal;

  const handleContinue = () => {
    router.push("/research-checkout/shipping");
  };

  if (isLoading || !isSignedIn || itemCount === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-8">
          <Link href="/" className="hover:text-foreground transition-colors">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground font-medium">Research Cart</span>
        </nav>

        <div className="flex items-center gap-3 mb-8">
          <FlaskConical className="w-6 h-6" />
          <div>
            <h1 className="text-2xl font-bold leading-tight">Your Research Cart</h1>
            <p className="text-sm text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 p-4 border rounded-xl bg-card hover:border-border/80 transition-colors"
              >
                <div className="relative w-20 h-20 flex-shrink-0 bg-muted rounded-lg overflow-hidden">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.product_title}
                      fill
                      className="object-contain p-1"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No image
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm leading-snug line-clamp-2">
                        {item.product_title}
                      </h3>
                      {(item.variant_title || item.dosage_label) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.variant_title || item.dosage_label}
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

            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
            >
              ← Continue Browsing
            </Link>
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <div className="p-5 border rounded-xl bg-card space-y-4">
                <h3 className="font-semibold">Order Summary</h3>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>${(subtotal / 100).toFixed(2)}</span>
                  </div>

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
