// components/Layouts/overlays/research-cart/ResearchCartButton.tsx
"use client";

import { FlaskConical } from "lucide-react";
import { useResearchCart } from "./research-cart-context";
import { Badge } from "@/components/ui/badge";

export default function ResearchCartButton() {
  const { itemCount, toggleCart } = useResearchCart();

  return (
    <button
      onClick={toggleCart}
      className="fixed bottom-6 left-6 z-40 bg-card border border-border rounded-2xl shadow-lg hover:shadow-xl transition-all p-3 flex flex-col items-center gap-1 min-w-[64px]"
      aria-label="Open research cart"
    >
      <div className="relative">
        <FlaskConical className="h-7 w-7 text-card-foreground" />
        {itemCount > 0 && (
          <Badge
            className="absolute -top-2 -right-2 h-5 min-w-5 rounded-full px-1.5 text-xs bg-destructive text-destructive-foreground border-2 border-card"
            variant="destructive"
          >
            {itemCount > 99 ? "99+" : itemCount}
          </Badge>
        )}
      </div>
      <span className="text-xs font-medium text-card-foreground">Cart</span>
    </button>
  );
}
