// components/Layouts/overlays/cart/CartItem.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";

interface CartItemProps {
  item: {
    id: string;
    variant_id: string;
    product_id: string;
    quantity: number;
    price_cents: number;
    product_title: string;
    product_slug: string;
    variant_title: string | null;
    image_url: string | null;
    image_alt?: string;
  };
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCart();

  const lineTotal = (item.price_cents * item.quantity) / 100;
  const unitPrice = item.price_cents / 100;

  return (
    <div className="flex gap-4 px-5 py-4 bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted)/0.3)] transition-colors">

      {/* ── Product image ── */}
      <Link
        href={`/products/${item.product_slug}`}
        className="relative flex-shrink-0 h-[88px] w-[88px] overflow-hidden rounded-xl bg-[hsl(var(--muted))] shadow-sm"
        tabIndex={-1}
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.image_alt ?? item.product_title}
            fill
            sizes="88px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))] opacity-30 text-2xl">
            🤠
          </div>
        )}
      </Link>

      {/* ── Details ── */}
      <div className="flex flex-1 flex-col justify-between min-w-0 py-0.5">

        {/* Top row: title + remove */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              href={`/products/${item.product_slug}`}
              className="block text-sm font-semibold text-[hsl(var(--foreground))] leading-snug line-clamp-2 hover:underline underline-offset-2"
            >
              {item.product_title}
            </Link>
            {item.variant_title && (
              <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))] truncate">
                {item.variant_title}
              </p>
            )}
          </div>

          {/* Remove button */}
          <button
            onClick={() => removeItem(item.id)}
            className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 transition-colors"
            aria-label="Remove item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bottom row: qty controls + price */}
        <div className="flex items-center justify-between gap-2 mt-2">

          {/* Quantity stepper */}
          <div className="flex items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] overflow-hidden">
            <button
              onClick={() => updateQuantity(item.id, item.quantity - 1)}
              disabled={item.quantity <= 1}
              className="flex h-8 w-8 items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-30 transition-colors active:scale-90"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>

            <span className="w-8 text-center text-sm font-semibold text-[hsl(var(--foreground))] tabular-nums select-none">
              {item.quantity}
            </span>

            <button
              onClick={() => updateQuantity(item.id, item.quantity + 1)}
              disabled={item.quantity >= 99}
              className="flex h-8 w-8 items-center justify-center text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] disabled:opacity-30 transition-colors active:scale-90"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Price */}
          <div className="text-right">
            <p className="text-sm font-bold text-[hsl(var(--foreground))] tabular-nums">
              ${lineTotal.toFixed(2)}
            </p>
            {item.quantity > 1 && (
              <p className="text-xs text-[hsl(var(--muted-foreground))] tabular-nums">
                ${unitPrice.toFixed(2)} ea
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}