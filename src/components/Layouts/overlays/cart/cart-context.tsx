// lib/cart-context.tsx
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// Types
export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  price_cents: number;

  // Flat display fields
  product_title: string;
  product_slug: string;
  variant_title?: string;
  variant_sku?: string;
  options?: Record<string, any>;
  added_note?: string;

  // Images
  image_url?: string | null;
  image_alt?: string | null;

  // Nested (optional, from API)
  product?: { id: string; title: string; slug: string } | null;
  variant?: { id: string; title?: string; sku?: string; options?: any; option_values?: any } | null;

  [key: string]: any;
}

export interface Cart {
  id: string;
  items: CartItem[];
  item_count: number;
  subtotal_cents: number;
  share_token?: string | null;
  share_enabled?: boolean;
  share_url?: string | null;
  share_name?: string | null;
  share_message?: string | null;
  [key: string]: any;
}

interface CartContextValue {
  cart: Cart | null;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  isLoading: boolean;
  isOpen: boolean;

  addItem: (variantId: string, quantity?: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;

  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;

  enableSharing: (name?: string, message?: string) => Promise<string>;
  disableSharing: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

// ─────────────────────────────────────────────
// Session ID
// ─────────────────────────────────────────────
function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = localStorage.getItem("dcg_session_id");
  if (!sessionId) {
    sessionId = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("dcg_session_id", sessionId);
  }
  return sessionId;
}

// ─────────────────────────────────────────────
// Normalize API response → Cart
//
// Handles two shapes:
//   A) GET /api/cart  → { ok, data: { id, items: [...flat...], item_count, subtotal_cents } }
//   B) GET /api/cart/items → { ok, data: { cart_id, items: [...nested...] } }
// ─────────────────────────────────────────────
function normalizeCartResponse(raw: any): Cart | null {
  if (!raw) return null;

  const payload: any = raw?.ok === true && raw?.data ? raw.data : raw;
  if (!payload || typeof payload !== "object") return null;

  const itemsRaw: any[] = Array.isArray(payload.items) ? payload.items : [];

  const items: CartItem[] = itemsRaw.map((it: any): CartItem => {
    // Image: prefer explicit field, then nested product shapes
    const image_url =
      it?.image_url ??
      it?.imageUrl ??
      it?.product?.image_url ??
      it?.product?.imageUrl ??
      null;

    const image_alt = it?.image_alt ?? it?.product?.image_alt ?? null;

    // Flat title/slug: prefer explicit fields (shape A), fall back to nested (shape B)
    const product_title =
      it?.product_title ?? it?.product?.title ?? "Unknown Product";
    const product_slug =
      it?.product_slug ?? it?.product?.slug ?? "";
    const variant_title =
      it?.variant_title ?? it?.variant?.title ?? undefined;
    const variant_sku =
      it?.variant_sku ?? it?.variant?.sku ?? undefined;
    const options =
      it?.options ??
      it?.variant?.options ??
      it?.variant?.option_values ??
      undefined;

    return {
      ...it,
      product_title,
      product_slug,
      variant_title,
      variant_sku,
      options,
      image_url,
      image_alt,
    };
  });

  // cart id: shape A uses "id", shape B uses "cart_id"
  const id = payload.id ?? payload.cart_id ?? null;

  const item_count =
    typeof payload.item_count === "number"
      ? payload.item_count
      : items.reduce((sum, i) => sum + (i.quantity ?? 0), 0);

  const subtotal_cents =
    typeof payload.subtotal_cents === "number"
      ? payload.subtotal_cents
      : items.reduce((sum, i) => sum + (i.price_cents ?? 0) * (i.quantity ?? 0), 0);

  return {
    ...payload,
    id,
    items,
    item_count,
    subtotal_cents,
  } as Cart;
}

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  // Uses /api/cart — now returns images too (Option B fix)
  const refreshCart = useCallback(async () => {
    try {
      const sessionId = getOrCreateSessionId();
      const response = await fetch("/api/cart", {
        headers: { "x-session-id": sessionId },
      });

      if (response.ok) {
        const raw = await response.json();
        setCart(normalizeCartResponse(raw));
      } else {
        setCart(null);
      }
    } catch (error) {
      console.error("Failed to fetch cart:", error);
      setCart(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addItem = useCallback(
    async (variantId: string, quantity: number = 1) => {
      const sessionId = getOrCreateSessionId();
      const response = await fetch("/api/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ variant_id: variantId, quantity }),
      });

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
      const sessionId = getOrCreateSessionId();
      const response = await fetch(`/api/cart/items/${itemId}`, {
        method: "DELETE",
        headers: { "x-session-id": sessionId },
      });

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

      const sessionId = getOrCreateSessionId();
      const response = await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ quantity }),
      });

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
    const sessionId = getOrCreateSessionId();
    const response = await fetch("/api/cart", {
      method: "DELETE",
      headers: { "x-session-id": sessionId },
    });

    if (response.ok) {
      await refreshCart();
    } else {
      const raw = await response.json().catch(() => null);
      throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to clear cart");
    }
  }, [refreshCart]);

  const enableSharing = useCallback(
    async (name?: string, message?: string): Promise<string> => {
      if (!cart) throw new Error("No cart to share");
      const sessionId = getOrCreateSessionId();
      const response = await fetch("/api/cart/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ cart_id: cart.id, share_name: name, share_message: message }),
      });

      if (response.ok) {
        const raw = await response.json();
        await refreshCart();
        return raw?.share_url ?? raw?.data?.share_url ?? "";
      }
      const raw = await response.json().catch(() => null);
      throw new Error(raw?.error?.message ?? raw?.message ?? "Failed to enable sharing");
    },
    [cart, refreshCart]
  );

  const disableSharing = useCallback(async () => {
    if (!cart) return;
    const sessionId = getOrCreateSessionId();
    const response = await fetch("/api/cart/share", {
      method: "DELETE",
      headers: { "x-session-id": sessionId },
    });
    if (response.ok) {
      await refreshCart();
    }
  }, [cart, refreshCart]);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen((prev) => !prev), []);

  const items = cart?.items ?? [];
  const itemCount = cart?.item_count ?? 0;
  const subtotal = cart?.subtotal_cents ?? 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        items,
        itemCount,
        subtotal,
        isLoading,
        isOpen,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        refreshCart,
        openCart,
        closeCart,
        toggleCart,
        enableSharing,
        disableSharing,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}