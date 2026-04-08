// components/POS/Cart/index.tsx
"use client";

import type { POSCartItem } from "../types";
import { CartItem } from "../CartItem";
import { CustomerEmail } from "../CustomerEmail";
import { DiscountPicker, discountCents } from "../DiscountPicker";
import type { POSDiscount } from "../DiscountPicker";
import "./styles.scss";

interface CartProps {
  items: POSCartItem[];
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  onQtyChange: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onCharge: () => void;
  onEmailChange: (v: string) => void;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  isProcessing: boolean;
  isDemo?: boolean;
  chargeError?: string | null;
  selectedDiscount: POSDiscount | null;
  onDiscountChange: (d: POSDiscount | null) => void;
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function Cart({
  items,
  customerEmail,
  customerFirstName,
  customerLastName,
  onQtyChange,
  onRemove,
  onClear,
  onCharge,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
  isProcessing,
  isDemo = false,
  chargeError = null,
  selectedDiscount,
  onDiscountChange,
}: CartProps) {
  const subtotal = items.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);
  const isEmpty = items.length === 0;
  const discount = discountCents(selectedDiscount, subtotal);
  const total = Math.max(0, subtotal - discount);

  return (
    <div className="pos-cart">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="pos-cart__header">
        <div className="pos-cart__header-left">
          <svg className="pos-cart__header-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span className="pos-cart__header-title">
            Current sale
            {itemCount > 0 && (
              <span className="pos-cart__header-count">{itemCount}</span>
            )}
          </span>
        </div>

        {!isEmpty && (
          <button
            type="button"
            className="pos-cart__clear-btn"
            onClick={onClear}
            aria-label="Clear cart"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* ── Items ───────────────────────────────────────────────── */}
      <div className="pos-cart__items">
        {isEmpty ? (
          <div className="pos-cart__empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="pos-cart__empty-icon">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <p className="pos-cart__empty-title">No items yet</p>
            <p className="pos-cart__empty-sub">Tap a product to add it to the sale</p>
          </div>
        ) : (
          <div className="pos-cart__item-list">
            {items.map((item) => (
              <CartItem
                key={item.key}
                item={item}
                onQtyChange={onQtyChange}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      {!isEmpty && (
        <div className="pos-cart__footer">
          {/* Customer info accordion */}
          <CustomerEmail
            email={customerEmail}
            firstName={customerFirstName}
            lastName={customerLastName}
            onEmailChange={onEmailChange}
            onFirstNameChange={onFirstNameChange}
            onLastNameChange={onLastNameChange}
          />

          {/* Discount picker */}
          <DiscountPicker
            subtotalCents={subtotal}
            selectedDiscount={selectedDiscount}
            onSelect={onDiscountChange}
          />

          {/* Totals */}
          <div className="pos-cart__totals">
            <div className="pos-cart__total-row">
              <span>Subtotal</span>
              <span>{fmtPrice(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="pos-cart__total-row pos-cart__total-row--discount">
                <span>Discount</span>
                <span className="pos-cart__discount-value">−{fmtPrice(discount)}</span>
              </div>
            )}
            <div className="pos-cart__total-row">
              <span>Shipping</span>
              <span className="pos-cart__free">Free</span>
            </div>
            <div className="pos-cart__total-row pos-cart__total-row--grand">
              <span>Total</span>
              <span>{fmtPrice(total)}</span>
            </div>
          </div>

          {/* Charge button */}
          <button
            type="button"
            className={`pos-cart__charge-btn${isDemo ? " pos-cart__charge-btn--demo" : ""}`}
            onClick={onCharge}
            disabled={isProcessing || isDemo}
          >
            {isProcessing ? (
              <>
                <span className="pos-cart__spinner" />
                Processing…
              </>
            ) : isDemo ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Reader not connected
              </>
            ) : (
              <>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                Charge {fmtPrice(total)}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}