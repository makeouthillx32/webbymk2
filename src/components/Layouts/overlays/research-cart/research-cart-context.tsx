// components/Layouts/overlays/research-cart/research-cart-context.tsx
//
// Cart context for research (labs) checkout. Unlike the shop cart, this is
// AUTH-ONLY — there is no guest/session_id path. Adding an item while signed
// out redirects straight to sign-in (next= back to the current page), which
// is what enforces "sign in before you go into cart" for research products.
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export interface ResearchCartItem {
  id: string;
  cart_id: string;
  research_product_id: string;
  research_variant_id: string | null;
  product_id: string;   // alias of research_product_id, for UI parity with shop cart
  variant_id: string | null;
  quantity: number;
  price_cents: number;
  product_title: string;
  variant_title?: string | null;
  dosage_label?: string | null;
  image_url?: string | null;
  [key: string]: any;
}

export interface ResearchCart {
  id: string | null;
  items: ResearchCartItem[];
  item_count: number;
  subtotal_cents: number;
}

interface ResearchCartContextValue {
  cart: ResearchCart | null;
  items: ResearchCartItem[];
  itemCount: number;
  subtotal: number;
  isLoading: boolean;
  isOpen: boolean;
  isSignedIn: boolean;

  addItem: (researchProductId: string, researchVariantId?: string | null, quantity?: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
}

const ResearchCartContext = createContext<ResearchCartContextValue | undefined>(undefined);

export function useResearchCart() {
  const context = useContext(ResearchCartContext);
  if (!context) throw new Error("useResearchCart must be used within ResearchCartProvider");
  return context;
}

function redirectToSignIn() {
  if (typeof window === "undefined") return;
  // Sign-in only lives on the core zone (www.unenter.live) — /sign-in is not
  // part of any zone subdomain's route whitelist. A relative "/sign-in" 404s
  // on labs.unenter.live and every other zone. `next` carries the full
  // absolute URL back so signInAction (which now allow-lists *.unenter.live
  // absolute URLs) can send them right back here after signing in.
  // Found via E2E checkout test, 2026-08-06.
  const isCoreZone = /^(www\.)?unenter\.live$/i.test(window.location.hostname);
  const currentUrl = window.location.origin + window.location.pathname + window.location.search;
  const next = encodeURIComponent(currentUrl);
  window.location.href = isCoreZone
    ? `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
    : `https://www.unenter.live/sign-in?next=${next}`;
}

export function ResearchCartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<ResearchCart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(true); // optimistic until first fetch resolves

  const refreshCart = useCallback(async () => {
    try {
      const response = await fetch("/api/research-cart");
      if (response.status === 401) {
        setIsSignedIn(false);
        setCart(null);
        return;
      }
      if (response.ok) {
        const raw = await response.json();
        const data = raw?.data ?? raw;
        setIsSignedIn(true);
        setCart({
          id: data?.id ?? null,
          items: data?.items ?? [],
          item_count: data?.item_count ?? 0,
          subtotal_cents: data?.subtotal_cents ?? 0,
        });
      } else {
        setCart(null);
      }
    } catch (error) {
      console.error("Failed to fetch research cart:", error);
      setCart(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addItem = useCallback(
    async (researchProductId: string, researchVariantId: string | null = null, quantity: number = 1) => {
      const response = await fetch("/api/research-cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_product_id: researchProductId,
          research_variant_id: researchVariantId,
          quantity,
        }),
      });

      if (response.status === 401) {
        redirectToSignIn();
        return;
      }

      if (response.ok) {
        await refreshCart();
        setIsOpen(true);
      } else {
        const raw = await response.json().catch(() => null);
        throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to add item");
      }
    },
    [refreshCart]
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const response = await fetch(`/api/research-cart/items/${itemId}`, { method: "DELETE" });
      if (response.status === 401) {
        redirectToSignIn();
        return;
      }
      if (response.ok) {
        await refreshCart();
      } else {
        const raw = await response.json().catch(() => null);
        throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to remove item");
      }
    },
    [refreshCart]
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (quantity < 1) return removeItem(itemId);

      const response = await fetch(`/api/research-cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });

      if (response.status === 401) {
        redirectToSignIn();
        return;
      }
      if (response.ok) {
        await refreshCart();
      } else {
        const raw = await response.json().catch(() => null);
        throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to update quantity");
      }
    },
    [refreshCart, removeItem]
  );

  const clearCart = useCallback(async () => {
    const response = await fetch("/api/research-cart", { method: "DELETE" });
    if (response.ok) {
      await refreshCart();
    } else if (response.status !== 401) {
      const raw = await response.json().catch(() => null);
      throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to clear cart");
    }
  }, [refreshCart]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);

  const items = cart?.items ?? [];
  const itemCount = cart?.item_count ?? 0;
  const subtotal = cart?.subtotal_cents ?? 0;

  return (
    <ResearchCartContext.Provider
      value={{
        cart,
        items,
        itemCount,
        subtotal,
        isLoading,
        isOpen,
        isSignedIn,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        refreshCart,
        openCart,
        closeCart,
        toggleCart,
      }}
    >
      {children}
    </ResearchCartContext.Provider>
  );
}
