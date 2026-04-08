// components/cart/EmptyCart.tsx
"use client";

import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";
import Link from "next/link";

export default function EmptyCart() {
  const { closeCart } = useCart();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Icon */}
      <div className="mb-4 rounded-full bg-muted p-6">
        <ShoppingBag className="h-12 w-12 text-muted-foreground" />
      </div>

      {/* Message */}
      <h3 className="text-xl font-semibold mb-2">Your cart is empty</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Looks like you haven't added anything to your cart yet. Start shopping to fill it up!
      </p>

      {/* Continue Shopping Button */}
      <Button asChild size="lg" onClick={closeCart}>
        <Link href="/shop">
          Start Shopping
        </Link>
      </Button>
    </div>
  );
}