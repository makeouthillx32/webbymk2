// components/Layouts/overlays/research-cart/ResearchCartDrawer.tsx
"use client";

import { useResearchCart } from "./research-cart-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import ResearchCartItem from "./ResearchCartItem";
import ResearchEmptyCart from "./ResearchEmptyCart";
import { ArrowRight, FlaskConical, X } from "lucide-react";

export default function ResearchCartDrawer() {
  const router = useRouter();
  const { isOpen, closeCart, items, itemCount, subtotal } = useResearchCart();

  const handleCheckout = () => {
    closeCart();
    router.push("/research-checkout");
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <SheetContent
        side="right"
        className="flex flex-col w-full sm:max-w-[420px] p-0 gap-0 border-l border-[hsl(var(--border))]"
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)]">
              <FlaskConical className="h-4 w-4 text-[hsl(var(--primary))]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold leading-tight text-[hsl(var(--foreground))] tracking-tight">
                Research Cart
              </h2>
              {itemCount > 0 && (
                <p className="text-xs text-[hsl(var(--muted-foreground))] leading-tight">
                  {itemCount} {itemCount === 1 ? "item" : "items"} &middot; ${(subtotal / 100).toFixed(2)}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={closeCart}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] active:scale-95"
            aria-label="Close cart"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1 bg-[hsl(var(--background))]">
          {items.length === 0 ? (
            <ResearchEmptyCart />
          ) : (
            <div className="divide-y divide-[hsl(var(--border)/0.5)]">
              {items.map((item) => (
                <ResearchCartItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </ScrollArea>

        {items.length > 0 && (
          <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 pt-4 pb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                Subtotal
              </span>
              <span className="text-2xl font-bold text-[hsl(var(--foreground))] tabular-nums">
                ${(subtotal / 100).toFixed(2)}
              </span>
            </div>

            <p className="text-xs text-[hsl(var(--muted-foreground))] text-center pb-1">
              Taxes &amp; shipping calculated at checkout
            </p>

            <Button
              size="lg"
              className="w-full h-13 text-sm font-bold tracking-wide rounded-xl shadow-sm active:scale-[0.98] transition-transform"
              onClick={handleCheckout}
            >
              Proceed to Checkout
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <button
              onClick={closeCart}
              className="w-full py-2.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors rounded-xl hover:bg-[hsl(var(--muted)/0.5)]"
            >
              Continue Browsing
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
