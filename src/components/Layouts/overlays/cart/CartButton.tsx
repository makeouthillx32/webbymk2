// components/cart/CartButton.tsx
"use client";

import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function CartButton() {
  const { itemCount, toggleCart } = useCart();

  return (
    <button
      onClick={toggleCart}
      className="fixed bottom-6 left-6 z-40 bg-card border border-border rounded-2xl shadow-lg hover:shadow-xl transition-all p-3 flex flex-col items-center gap-1 min-w-[64px]"
      aria-label="Open shopping cart"
    >
      {/* Shopping cart icon with badge */}
      <div className="relative">
        <ShoppingCart className="h-7 w-7 text-card-foreground" />
        {itemCount > 0 && (
          <Badge 
            className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1.5 text-xs bg-destructive text-destructive-foreground border-2 border-card"
            variant="destructive"
          >
            {itemCount > 99 ? '99+' : itemCount}
          </Badge>
        )}
      </div>
      
      {/* Cart label */}
      <span className="text-xs font-medium text-card-foreground">Cart</span>
    </button>
  );
}