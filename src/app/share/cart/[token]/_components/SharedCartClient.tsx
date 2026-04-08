"use client";

// app/share/cart/[token]/_components/SharedCartClient.tsx

import { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ShoppingCart,
  Copy,
  Check,
  ArrowRight,
  Gift,
  MessageSquareQuote,
} from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SharedCartItem {
  id: string;
  variant_id: string | null;
  quantity: number;
  price_cents: number;
  added_note: string | null;
  product_title: string;
  product_slug: string;
  variant_title: string | null;
  variant_sku: string | null;
  options: Record<string, any> | null;
  image_url: string | null;
  image_alt: string;
}

interface SharedCartClientProps {
  token: string;
  shareName: string;
  shareMessage: string | null;
  items: SharedCartItem[];
  subtotalCents: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100
  );
}

function getOptionSummary(options: Record<string, any> | null): string {
  if (!options) return "";
  const parts: string[] = [];
  if (options.size) parts.push(options.size);
  if (options.color) {
    const c = options.color;
    if (typeof c === "string") parts.push(c);
    else if (c?.name) parts.push(c.name);
  }
  const known = new Set(["size", "color"]);
  for (const [key, val] of Object.entries(options)) {
    if (known.has(key)) continue;
    if (typeof val === "string") parts.push(val);
    else if (val?.name) parts.push(val.name);
  }
  return parts.join(" · ");
}

function getSessionId(): string {
  if (typeof window === "undefined") return `anon_${Date.now()}`;
  let id = localStorage.getItem("dcg_session_id");
  if (!id) {
    id = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("dcg_session_id", id);
  }
  return id;
}

// ─── Item Card ────────────────────────────────────────────────────────────────

function CartItemCard({
  item,
  onAddToCart,
  adding,
  added,
}: {
  item: SharedCartItem;
  onAddToCart: (item: SharedCartItem) => void;
  adding: boolean;
  added: boolean;
}) {
  const optionSummary = getOptionSummary(item.options);
  const subtitle = item.variant_title || optionSummary || null;

  return (
    <div className="group flex gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-all hover:shadow-md">
      {/* Image */}
      <Link
        href={`/products/${item.product_slug}`}
        className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-[hsl(var(--muted))]"
      >
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.image_alt}
            fill
            sizes="96px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ShoppingCart className="h-8 w-8 text-[hsl(var(--muted-foreground))] opacity-30" />
          </div>
        )}
      </Link>

      {/* Details */}
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/products/${item.product_slug}`}
            className="block truncate text-sm font-semibold text-[hsl(var(--foreground))] hover:underline"
          >
            {item.product_title}
          </Link>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-[hsl(var(--muted-foreground))]">
              {subtitle}
            </p>
          )}
          {item.added_note && (
            <p className="mt-1 flex items-start gap-1 text-xs italic text-[hsl(var(--muted-foreground))]">
              <MessageSquareQuote className="mt-0.5 h-3 w-3 flex-shrink-0" />
              <span className="line-clamp-2">{item.added_note}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-[hsl(var(--foreground))]">
              {formatMoney(item.price_cents)}
            </span>
            {item.quantity > 1 && (
              <span className="rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]">
                ×{item.quantity}
              </span>
            )}
          </div>

          <button
            onClick={() => onAddToCart(item)}
            disabled={adding || added || !item.variant_id}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--primary-foreground))] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {added ? (
              <>
                <Check className="h-3 w-3" />
                Added!
              </>
            ) : adding ? (
              <>
                <ShoppingCart className="h-3 w-3 animate-pulse" />
                Adding…
              </>
            ) : (
              <>
                <ShoppingCart className="h-3 w-3" />
                Add to Cart
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SharedCartClient({
  token,
  shareName,
  shareMessage,
  items,
  subtotalCents,
}: SharedCartClientProps) {
  const { addItem, openCart, refreshCart } = useCart();

  const [copied, setCopied] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [addedAll, setAddedAll] = useState(false);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [addedItemIds, setAddedItemIds] = useState<Set<string>>(new Set());

  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  // ── Copy share link ──────────────────────────────────────────────────────────
  const handleCopyLink = useCallback(async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, []);

  // ── Add single item ──────────────────────────────────────────────────────────
  const handleAddItem = useCallback(
    async (item: SharedCartItem) => {
      if (!item.variant_id) return;
      setAddingItemId(item.id);
      try {
        await addItem(item.variant_id, item.quantity);
        setAddedItemIds((prev) => new Set(prev).add(item.id));
      } catch (err) {
        console.error("Failed to add item:", err);
      } finally {
        setAddingItemId(null);
      }
    },
    [addItem]
  );

  // ── Add all via clone API ────────────────────────────────────────────────────
  const handleAddAll = useCallback(async () => {
    setAddingAll(true);
    try {
      const sessionId = getSessionId();
      const res = await fetch(`/api/share/cart/${token}/clone`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
      });

      if (res.ok) {
        setAddedAll(true);
        await refreshCart();
        openCart();
      } else {
        console.error("Clone failed:", await res.text());
      }
    } catch (err) {
      console.error("Failed to clone cart:", err);
    } finally {
      setAddingAll(false);
    }
  }, [token, refreshCart, openCart]);

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden px-4 py-14 text-white"
        style={{
          background: "linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 80%, #d97706 100%)",
        }}
      >
        {/* Subtle star accents */}
        <span className="pointer-events-none absolute left-8 top-6 select-none text-7xl text-white/10">✦</span>
        <span className="pointer-events-none absolute bottom-6 right-10 select-none text-5xl text-white/10">✦</span>
        <span className="pointer-events-none absolute bottom-8 left-1/3 select-none text-3xl text-white/8">✦</span>

        <div className="relative mx-auto max-w-2xl text-center">
          {/* Badge */}
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest backdrop-blur-sm">
            <Gift className="h-3.5 w-3.5" />
            Shared Wishlist
          </div>

          {/* Title */}
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {shareName}
          </h1>

          {/* Message */}
          {shareMessage && (
            <p className="mt-3 text-base italic leading-relaxed text-white/80 sm:text-lg">
              &ldquo;{shareMessage}&rdquo;
            </p>
          )}

          {/* Stats */}
          <div className="mt-6 flex items-center justify-center gap-5 text-sm text-white/70">
            <span>
              <strong className="text-white">{itemCount}</strong>{" "}
              {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="h-1 w-1 rounded-full bg-white/40" />
            <span>
              <strong className="text-white">{formatMoney(subtotalCents)}</strong> total
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-2xl px-4 py-8">

        {/* CTA buttons */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={handleAddAll}
            disabled={addingAll || addedAll || items.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
          >
            {addedAll ? (
              <>
                <Check className="h-4 w-4" />
                Added to Your Cart — Yeehaw!
              </>
            ) : addingAll ? (
              <>
                <ShoppingCart className="h-4 w-4 animate-bounce" />
                Adding Everything…
              </>
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                Add Everything to My Cart
              </>
            )}
          </button>

          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3.5 text-sm font-semibold text-[hsl(var(--foreground))] transition-all hover:bg-[hsl(var(--muted))]"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-green-500" />
                Link Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Link
              </>
            )}
          </button>
        </div>

        {/* Item list */}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--border))] py-16 text-center">
            <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-[hsl(var(--muted-foreground))] opacity-40" />
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              This wishlist is empty.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <CartItemCard
                key={item.id}
                item={item}
                onAddToCart={handleAddItem}
                adding={addingItemId === item.id}
                added={addedItemIds.has(item.id)}
              />
            ))}
          </div>
        )}

        {/* Subtotal */}
        {items.length > 0 && (
          <div className="mt-6 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                Subtotal ({itemCount} {itemCount === 1 ? "item" : "items"})
              </span>
              <span className="text-lg font-bold text-[hsl(var(--foreground))]">
                {formatMoney(subtotalCents)}
              </span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              Shipping and taxes calculated at checkout.
            </p>
          </div>
        )}

        {/* Browse CTA */}
        <div className="mt-8 text-center">
          <Link
            href="/collections/all"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--primary))] hover:underline"
          >
            Browse the full Desert Cowgirl shop
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Brand footer */}
        <p className="mt-10 text-center text-xs text-[hsl(var(--muted-foreground))]">
          ✦ Desert Cowgirl Co. · Western-inspired boutique fashion ✦
        </p>
      </div>
    </div>
  );
}