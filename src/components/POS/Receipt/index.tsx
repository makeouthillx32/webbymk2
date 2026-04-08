// components/POS/Receipt/index.tsx
"use client";

import { useState, useCallback } from "react";
import type { POSCartItem } from "../types";
import { PrinterManager } from "../PrinterManager";
import { printReceipt } from "@/lib/thermalPrinter";
import type { PrinterConnection } from "@/lib/thermalPrinter";
import "./styles.scss";

interface ReceiptProps {
  orderNumber: string;
  items: POSCartItem[];
  subtotalCents: number;
  discountCents?: number;
  totalCents: number;
  discountLabel?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  onNewSale: () => void;
  printerConnection: PrinterConnection | null;
  onPrinterConnectionChange: (conn: PrinterConnection | null) => void;
  paperWidth: 58 | 80;
  onPaperWidthChange: (w: 58 | 80) => void;
}

function fmtPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate() {
  return new Date().toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function Receipt({
  orderNumber,
  items,
  subtotalCents,
  discountCents = 0,
  totalCents,
  discountLabel,
  customerName,
  customerEmail,
  onNewSale,
  printerConnection,
  onPrinterConnectionChange,
  paperWidth,
  onPaperWidthChange,
}: ReceiptProps) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printSuccess, setPrintSuccess] = useState(false);

  // ── Thermal print ────────────────────────────────────────────
  const handleThermalPrint = useCallback(async () => {
    if (!printerConnection) return;
    setPrinting(true);
    setPrintError(null);
    setPrintSuccess(false);
    try {
      await printReceipt(printerConnection, {
        orderNumber,
        items,
        subtotalCents,
        discountCents,
        totalCents,
        discountLabel,
        customerName,
        customerEmail,
        date: new Date(),
      }, paperWidth);
      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (e: any) {
      setPrintError(e.message ?? "Print failed");
    } finally {
      setPrinting(false);
    }
  }, [printerConnection, orderNumber, items, subtotalCents, discountCents, totalCents, discountLabel, customerName, customerEmail, paperWidth]);

  // ── Browser print / save as PDF ──────────────────────────────
  const handleBrowserPrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <>
      {/* ── Screen view ─────────────────────────────────────────── */}
      <div className="pos-receipt" id="pos-receipt-screen">
        {/* Success mark */}
        <div className="pos-receipt__success">
          <div className="pos-receipt__check-ring">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="pos-receipt__title">Yeehaw! 🤠</h2>
          <p className="pos-receipt__subtitle">
            {customerEmail
              ? <>Receipt sent to <strong>{customerEmail}</strong></>
              : "Walk-up sale recorded."}
          </p>
        </div>

        {/* Printer manager */}
        <PrinterManager
          connection={printerConnection}
          onConnectionChange={onPrinterConnectionChange}
          paperWidth={paperWidth}
          onPaperWidthChange={onPaperWidthChange}
        />

        {/* Receipt card */}
        <div className="pos-receipt__card" id="pos-receipt-printable">
          <div className="pos-receipt__card-header">
            <div>
              <p className="pos-receipt__card-label">Desert Cowgirl Co.</p>
              <p className="pos-receipt__card-sublabel">{orderNumber}</p>
            </div>
            <p className="pos-receipt__card-date">{fmtDate()}</p>
          </div>

          <div className="pos-receipt__divider" aria-hidden>
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} className="pos-receipt__divider-dash" />
            ))}
          </div>

          <div className="pos-receipt__items">
            {items.map((item) => (
              <div key={item.key} className="pos-receipt__item">
                <div className="pos-receipt__item-info">
                  <span className="pos-receipt__item-name">{item.product_title}</span>
                  {item.variant_title && item.variant_title !== "Default" && item.variant_title !== "" && (
                    <span className="pos-receipt__item-variant">{item.variant_title}</span>
                  )}
                </div>
                <div className="pos-receipt__item-right">
                  <span className="pos-receipt__item-qty">×{item.quantity}</span>
                  <span className="pos-receipt__item-price">
                    {fmtPrice(item.price_cents * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pos-receipt__divider" aria-hidden>
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} className="pos-receipt__divider-dash" />
            ))}
          </div>

          {/* Totals */}
          <div className="pos-receipt__totals">
            {discountCents > 0 && (
              <>
                <div className="pos-receipt__total-row">
                  <span>Subtotal</span>
                  <span>{fmtPrice(subtotalCents)}</span>
                </div>
                <div className="pos-receipt__total-row pos-receipt__total-row--discount">
                  <span>{discountLabel ? `Discount (${discountLabel})` : "Discount"}</span>
                  <span>−{fmtPrice(discountCents)}</span>
                </div>
              </>
            )}
            <div className="pos-receipt__total pos-receipt__total--grand">
              <span>Total</span>
              <span>{fmtPrice(totalCents)}</span>
            </div>
          </div>

          <div className="pos-receipt__paid">PAID</div>

          <p className="pos-receipt__footer-text">
            Thank you for shopping with us!<br />
            desertcowgirlco.com
          </p>
        </div>

        {/* Print error */}
        {printError && (
          <p className="pos-receipt__print-error">{printError}</p>
        )}

        {/* Actions */}
        <div className="pos-receipt__actions">
          {/* Thermal print button — only if printer connected */}
          {printerConnection && (
            <button
              type="button"
              className={`pos-receipt__btn pos-receipt__btn--thermal${printSuccess ? " pos-receipt__btn--success" : ""}`}
              onClick={handleThermalPrint}
              disabled={printing}
            >
              {printing ? (
                <><span className="pos-receipt__spinner" /> Printing…</>
              ) : printSuccess ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Printed!</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg> Print Receipt</>
              )}
            </button>
          )}

          {/* Save as PDF — always available */}
          <button
            type="button"
            className="pos-receipt__btn pos-receipt__btn--secondary"
            onClick={handleBrowserPrint}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Save PDF
          </button>

          <button
            type="button"
            className="pos-receipt__btn pos-receipt__btn--primary"
            onClick={onNewSale}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            New Sale
          </button>
        </div>
      </div>

      {/* ── Print-only view — rendered by window.print() ────────── */}
      <div className="pos-receipt-print" aria-hidden>
        <div className="pos-receipt-print__header">
          <strong>Desert Cowgirl Co.</strong><br />
          {orderNumber}<br />
          {fmtDate()}
        </div>
        <hr />
        {items.map((item) => (
          <div key={item.key} className="pos-receipt-print__row">
            <span>{item.quantity}× {item.product_title}{item.variant_title && item.variant_title !== "Default" ? ` / ${item.variant_title}` : ""}</span>
            <span>{fmtPrice(item.price_cents * item.quantity)}</span>
          </div>
        ))}
        <hr />
        {discountCents > 0 && (
          <>
            <div className="pos-receipt-print__row">
              <span>Subtotal</span><span>{fmtPrice(subtotalCents)}</span>
            </div>
            <div className="pos-receipt-print__row">
              <span>{discountLabel ? `Discount (${discountLabel})` : "Discount"}</span>
              <span>−{fmtPrice(discountCents)}</span>
            </div>
          </>
        )}
        <div className="pos-receipt-print__row pos-receipt-print__row--total">
          <strong>TOTAL</strong><strong>{fmtPrice(totalCents)}</strong>
        </div>
        <hr />
        <div className="pos-receipt-print__footer">
          PAID<br />
          Thank you for shopping with us!<br />
          desertcowgirlco.com
        </div>
      </div>
    </>
  );
}