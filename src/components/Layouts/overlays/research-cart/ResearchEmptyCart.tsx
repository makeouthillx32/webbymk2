// components/Layouts/overlays/research-cart/ResearchEmptyCart.tsx
"use client";

import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResearchCart } from "./research-cart-context";
import Link from "next/link";

export default function ResearchEmptyCart() {
  const { closeCart } = useResearchCart();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="mb-4 rounded-full bg-muted p-6">
        <FlaskConical className="h-12 w-12 text-muted-foreground" />
      </div>

      <h3 className="text-xl font-semibold mb-2">Your research cart is empty</h3>
      <p className="text-muted-foreground mb-6 max-w-sm">
        Browse our catalog and add compounds to get started.
      </p>

      <Button asChild size="lg" onClick={closeCart}>
        <Link href="/">Browse Catalog</Link>
      </Button>
    </div>
  );
}
