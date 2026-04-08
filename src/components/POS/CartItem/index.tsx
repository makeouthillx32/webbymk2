// components/POS/CartItem/index.tsx
"use client";

import Image from "next/image";
import type { POSCartItem } from "../types";
import "./styles.scss";

interface CartItemProps {
  item: POSCartItem;
  onQtyChange: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CartItem({ item, onQtyChange, onRemove }: CartItemProps) {
  const isCustom = item.product_id === "custom";

  return (
    <div className="cart-item">
      {/* Thumbnail */}
      <div className="cart-item__thumb">
        {!isCustom && item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.product_title}
            fill
            className="cart-item__thumb-img"
            sizes="44px"
          />
        ) : (
          <div className="cart-item__thumb-placeholder" aria-hidden>
            {isCustom ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="cart-item__info">
        <p className="cart-item__title">{item.product_title}</p>
        {item.variant_title && item.variant_title !== "Default" && item.variant_title !== "" && (
          <p className="cart-item__variant">{item.variant_title}</p>
        )}
        <p className="cart-item__subtotal">
          {fmtPrice(item.price_cents * item.quantity)}
          {item.quantity > 1 && (
            <span className="cart-item__unit-price"> · {fmtPrice(item.price_cents)} ea</span>
          )}
        </p>
      </div>

      {/* Qty controls */}
      <div className="cart-item__qty">
        <button
          type="button"
          className="cart-item__qty-btn"
          onClick={() => onQtyChange(item.key, item.quantity - 1)}
          aria-label="Decrease"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <span className="cart-item__qty-val">{item.quantity}</span>
        <button
          type="button"
          className="cart-item__qty-btn"
          onClick={() => onQtyChange(item.key, item.quantity + 1)}
          aria-label="Increase"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Remove */}
      <button
        type="button"
        className="cart-item__remove"
        onClick={() => onRemove(item.key)}
        aria-label="Remove item"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  );
}