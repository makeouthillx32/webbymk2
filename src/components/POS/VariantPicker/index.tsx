// components/POS/VariantPicker/index.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import type { POSProduct, POSVariant } from "../types";
import "./styles.scss";

interface VariantPickerProps {
  product: POSProduct | null;
  onAdd: (product: POSProduct, variant: POSVariant, qty: number) => void;
  onClose: () => void;
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function VariantPicker({ product, onAdd, onClose }: VariantPickerProps) {
  const [selected, setSelected] = useState<POSVariant | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (product) {
      setSelected(product.variants[0] ?? null);
      setQty(1);
    }
  }, [product]);

  // Close on Escape
  useEffect(() => {
    if (!product) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  const handleAdd = useCallback(() => {
    if (!selected || !product) return;
    onAdd(product, selected, qty);
    onClose();
  }, [product, selected, qty, onAdd, onClose]);

  if (!product) return null;

  const isSingleDefault =
    product.variants.length === 1 && product.variants[0]?.title === "Default";

  const maxQty =
    selected?.track_inventory && !selected?.allow_backorder
      ? selected.inventory_qty
      : 99;

  const canAdd = !!selected && maxQty > 0 && qty >= 1;
  const lineTotal = (selected?.price_cents ?? product.price_cents) * qty;

  return (
    <>
      {/* Backdrop */}
      <div className="vp-backdrop" onClick={onClose} aria-hidden />

      {/* Modal */}
      <div className="vp" role="dialog" aria-modal aria-label={`Select options for ${product.title}`}>
        {/* Header */}
        <div className="vp__header">
          {product.image_url && (
            <div className="vp__thumb">
              <Image
                src={product.image_url}
                alt={product.title}
                fill
                className="vp__thumb-img"
                sizes="72px"
              />
            </div>
          )}
          <div className="vp__title-block">
            <h2 className="vp__name">{product.title}</h2>
            <p className="vp__price">
              {fmtPrice(selected?.price_cents ?? product.price_cents)}
              {selected?.compare_at_price_cents && selected.compare_at_price_cents > selected.price_cents && (
                <span className="vp__price-compare">
                  {fmtPrice(selected.compare_at_price_cents)}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            className="vp__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="vp__body">
          {/* Variant grid */}
          {!isSingleDefault && (
            <section className="vp__section">
              <h3 className="vp__section-label">Variant</h3>
              <div className="vp__variants">
                {product.variants.map((v) => {
                  const oos = v.track_inventory && !v.allow_backorder && v.inventory_qty <= 0;
                  const isActive = selected?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      disabled={oos}
                      onClick={() => { setSelected(v); setQty(1); }}
                      className={`vp__variant-btn ${isActive ? "vp__variant-btn--active" : ""} ${oos ? "vp__variant-btn--oos" : ""}`}
                    >
                      {v.title}
                      {oos && <span className="vp__variant-oos-label">Out of stock</span>}
                    </button>
                  );
                })}
              </div>

              {/* Selected variant meta */}
              {selected && (
                <p className="vp__variant-meta">
                  {selected.track_inventory
                    ? selected.inventory_qty > 0
                      ? `${selected.inventory_qty} in stock`
                      : "Out of stock"
                    : "Stock not tracked"}
                  {selected.sku && ` · SKU: ${selected.sku}`}
                </p>
              )}
            </section>
          )}

          {/* Options pills (read-only) */}
          {selected && Object.keys(selected.options).length > 0 && (
            <section className="vp__section">
              <h3 className="vp__section-label">Details</h3>
              <div className="vp__options">
                {Object.entries(selected.options).map(([k, v]) => {
                  // Option values may be plain strings OR objects like {hex, name}
                  const label =
                    typeof v === "string"
                      ? v
                      : typeof v === "object" && v !== null
                        ? (v as any).name ?? (v as any).label ?? JSON.stringify(v)
                        : String(v);
                  const hex =
                    typeof v === "object" && v !== null ? (v as any).hex ?? null : null;
                  return (
                    <span key={k} className="vp__option-pill">
                      {hex && (
                        <span
                          className="vp__option-swatch"
                          style={{ background: hex }}
                        />
                      )}
                      <span className="vp__option-key">{k}:</span> {label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {/* Quantity */}
          <section className="vp__section">
            <h3 className="vp__section-label">Quantity</h3>
            <div className="vp__qty">
              <button
                type="button"
                className="vp__qty-btn"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>

              <span className="vp__qty-value" aria-live="polite">{qty}</span>

              <button
                type="button"
                className="vp__qty-btn"
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                disabled={qty >= maxQty}
                aria-label="Increase quantity"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </section>
        </div>

        {/* Add button */}
        <div className="vp__footer">
          <button
            type="button"
            className="vp__add-btn"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            Add to Sale — {fmtPrice(lineTotal)}
          </button>
        </div>
      </div>
    </>
  );
}