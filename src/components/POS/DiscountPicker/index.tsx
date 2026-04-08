// components/POS/DiscountPicker/index.tsx
"use client";

import { useState, useEffect } from "react";
import "./styles.scss";

export interface POSDiscount {
  id: string;
  code: string;
  label: string | null;
  type: string;           // "percentage" | "fixed"
  percent_off: number | null;
  amount_off_cents: number | null;
}

interface DiscountPickerProps {
  subtotalCents: number;
  selectedDiscount: POSDiscount | null;
  onSelect: (discount: POSDiscount | null) => void;
}

function discountLabel(d: POSDiscount): string {
  if (d.label) return d.label;
  if (d.percent_off) return `${d.code} — ${d.percent_off}% off`;
  if (d.amount_off_cents) return `${d.code} — $${(d.amount_off_cents / 100).toFixed(2)} off`;
  return d.code;
}

function discountAmount(d: POSDiscount, subtotalCents: number): number {
  if (d.percent_off) return Math.round(subtotalCents * d.percent_off / 100);
  if (d.amount_off_cents) return Math.min(d.amount_off_cents, subtotalCents);
  return 0;
}

export function discountCents(d: POSDiscount | null, subtotalCents: number): number {
  if (!d) return 0;
  return discountAmount(d, subtotalCents);
}

export function DiscountPicker({ subtotalCents, selectedDiscount, onSelect }: DiscountPickerProps) {
  const [open, setOpen] = useState(false);
  const [discounts, setDiscounts] = useState<POSDiscount[]>([]);
  const [loading, setLoading] = useState(false);

  // Load discounts once on first open
  useEffect(() => {
    if (!open || discounts.length > 0) return;
    setLoading(true);
    fetch("/api/pos/discounts")
      .then((r) => r.json())
      .then(({ discounts: data }) => setDiscounts(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const savings = selectedDiscount ? discountAmount(selectedDiscount, subtotalCents) : 0;

  return (
    <div className={`pos-discount${open ? " pos-discount--open" : ""}${selectedDiscount ? " pos-discount--active" : ""}`}>
      {/* Accordion header */}
      <button
        type="button"
        className="pos-discount__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="pos-discount__toggle-left">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
            <line x1="7" y1="7" x2="7.01" y2="7"/>
          </svg>
          <span>
            {selectedDiscount
              ? discountLabel(selectedDiscount)
              : "Apply discount"}
          </span>
          {selectedDiscount && savings > 0 && (
            <span className="pos-discount__saving">
              −${(savings / 100).toFixed(2)}
            </span>
          )}
        </span>
        <svg
          className="pos-discount__chevron"
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown body */}
      {open && (
        <div className="pos-discount__body">
          {loading ? (
            <p className="pos-discount__loading">Loading discounts…</p>
          ) : discounts.length === 0 ? (
            <p className="pos-discount__empty">No discounts available</p>
          ) : (
            <div className="pos-discount__list">
              {/* None option */}
              <button
                type="button"
                className={`pos-discount__option${!selectedDiscount ? " pos-discount__option--selected" : ""}`}
                onClick={() => { onSelect(null); setOpen(false); }}
              >
                <span className="pos-discount__option-label">No discount</span>
                <span className="pos-discount__option-check">
                  {!selectedDiscount && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </span>
              </button>

              {discounts.map((d) => {
                const isSelected = selectedDiscount?.id === d.id;
                const amt = discountAmount(d, subtotalCents);
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`pos-discount__option${isSelected ? " pos-discount__option--selected" : ""}`}
                    onClick={() => { onSelect(d); setOpen(false); }}
                  >
                    <span className="pos-discount__option-label">
                      {discountLabel(d)}
                    </span>
                    <span className="pos-discount__option-right">
                      {subtotalCents > 0 && amt > 0 && (
                        <span className="pos-discount__option-saving">
                          −${(amt / 100).toFixed(2)}
                        </span>
                      )}
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}