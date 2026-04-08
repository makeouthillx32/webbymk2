// components/orders/ReprintReceipt/index.tsx
// Self-contained receipt reprint panel for POS orders in the OrderDetailsDialog.
// Manages its own printer connection — no dependency on POS state tree.
"use client";

import { useState, useCallback } from "react";
import { Printer, Bluetooth, Usb, CheckCircle2, X } from "lucide-react";
import {
  canUseSerial,
  canUseBluetooth,
  connectUSB,
  connectBluetooth,
  disconnectUSB,
  disconnectBluetooth,
  printReceipt,
} from "@/lib/thermalPrinter";
import type { PrinterConnection } from "@/lib/thermalPrinter";
import type { AdminOrder } from "@/lib/orders/types";

interface ReprintReceiptProps {
  order: AdminOrder;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ReprintReceipt({ order }: ReprintReceiptProps) {
  const [expanded, setExpanded]       = useState(false);
  const [connection, setConnection]   = useState<PrinterConnection | null>(null);
  const [connecting, setConnecting]   = useState(false);
  const [printing, setPrinting]       = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);
  const [paperWidth, setPaperWidth]   = useState<58 | 80>(58);
  const [error, setError]             = useState<string | null>(null);

  // ── Connect ─────────────────────────────────────────────────────
  const handleConnectUSB = useCallback(async () => {
    setConnecting(true); setError(null);
    try {
      const conn = await connectUSB();
      setConnection(conn);
    } catch (e: any) {
      if (e.name !== "NotFoundError") setError(e.message);
    } finally { setConnecting(false); }
  }, []);

  const handleConnectBT = useCallback(async () => {
    setConnecting(true); setError(null);
    try {
      const conn = await connectBluetooth();
      setConnection(conn);
    } catch (e: any) {
      if (e.name !== "NotFoundError") setError(e.message);
    } finally { setConnecting(false); }
  }, []);

  const handleDisconnect = useCallback(async () => {
    if (!connection) return;
    if (connection.type === "usb") await disconnectUSB(connection);
    else disconnectBluetooth(connection);
    setConnection(null);
  }, [connection]);

  // ── Thermal print ────────────────────────────────────────────────
  const handleThermalPrint = useCallback(async () => {
    if (!connection) return;
    setPrinting(true); setError(null); setPrintSuccess(false);
    try {
      const customerName = [order.customer_first_name, order.customer_last_name]
        .filter(Boolean).join(" ") || null;

      await printReceipt(connection, {
        orderNumber:   order.order_number,
        items:         order.items.map((i) => ({
          key:           i.id,
          product_title: i.title,
          variant_title: i.variant_title ?? "",
          price_cents:   i.price_cents,
          quantity:      i.quantity,
        })),
        subtotalCents:  order.subtotal_cents ?? order.total_cents,
        discountCents:  order.discount_cents ?? 0,
        totalCents:     order.total_cents,
        discountLabel:  order.discount_cents ? "Discount" : null,
        customerName,
        customerEmail:  order.email ?? null,
        date:           new Date(order.created_at),
      }, paperWidth);

      setPrintSuccess(true);
      setTimeout(() => setPrintSuccess(false), 3000);
    } catch (e: any) {
      setError(e.message ?? "Print failed");
    } finally { setPrinting(false); }
  }, [connection, order, paperWidth]);

  // ── Browser print / Save PDF ────────────────────────────────────
  const handleBrowserPrint = useCallback(() => {
    // Inject a minimal print stylesheet + content just for this receipt
    const w = window.open("", "_blank", "width=400,height=600");
    if (!w) return;

    const customerName = [order.customer_first_name, order.customer_last_name]
      .filter(Boolean).join(" ");
    const discountCents = order.discount_cents ?? 0;
    const subtotalCents = order.subtotal_cents ?? order.total_cents;

    const itemRows = order.items.map((item) => `
      <div class="row">
        <span>${item.quantity}× ${item.title}${item.variant_title && item.variant_title !== "Default" ? ` / ${item.variant_title}` : ""}</span>
        <span>${fmt(item.price_cents * item.quantity)}</span>
      </div>`).join("");

    const discountRow = discountCents > 0 ? `
      <div class="row"><span>Subtotal</span><span>${fmt(subtotalCents)}</span></div>
      <div class="row"><span>Discount</span><span>−${fmt(discountCents)}</span></div>` : "";

    w.document.write(`<!DOCTYPE html><html><head>
      <title>Receipt ${order.order_number}</title>
      <style>
        body { font-family: "Courier New", monospace; font-size: 11pt; width: 72mm; margin: 0 auto; padding: 8pt; }
        h2 { text-align: center; font-size: 13pt; margin: 0 0 4pt; }
        .sub { text-align: center; font-size: 9pt; color: #555; margin-bottom: 8pt; }
        hr { border: none; border-top: 1px dashed #000; margin: 6pt 0; }
        .row { display: flex; justify-content: space-between; margin: 3pt 0; font-size: 10pt; }
        .total { font-size: 12pt; font-weight: bold; }
        .footer { text-align: center; margin-top: 8pt; font-size: 9pt; color: #555; line-height: 1.8; }
      </style>
    </head><body>
      <h2>Desert Cowgirl Co.</h2>
      <div class="sub">${order.order_number}<br>${new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</div>
      <hr>
      ${itemRows}
      <hr>
      ${discountRow}
      <div class="row total"><span>TOTAL</span><span>${fmt(order.total_cents)}</span></div>
      <div class="row"><span>Payment</span><span>PAID</span></div>
      <hr>
      <div class="footer">${customerName ? customerName + "<br>" : ""}${order.email ? order.email + "<br>" : ""}Thank you for shopping with us!<br>desertcowgirlco.com</div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  }, [order]);

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Printer className="w-4 h-4" />
        Print Receipt
      </button>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Printer className="w-4 h-4" /> Print Receipt
        </span>
        <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Printer status */}
      <div className="flex items-center gap-2 text-sm">
        <span className={`w-2 h-2 rounded-full shrink-0 ${connection ? "bg-green-500" : "bg-gray-300"}`} />
        <span className="text-gray-600">
          {connection ? <><strong className="text-gray-900">{connection.name}</strong> connected</> : "No printer connected"}
        </span>
        {connection && (
          <button onClick={handleDisconnect} className="ml-auto text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2 py-0.5">
            Disconnect
          </button>
        )}
      </div>

      {/* Connect buttons */}
      {!connection && (
        <div className="flex flex-wrap gap-2">
          {canUseSerial() && (
            <button
              onClick={handleConnectUSB}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Usb className="w-3.5 h-3.5" />
              {connecting ? "Connecting…" : "Connect USB"}
            </button>
          )}
          {canUseBluetooth() && (
            <button
              onClick={handleConnectBT}
              disabled={connecting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              {connecting ? "Connecting…" : "Connect Bluetooth"}
            </button>
          )}
          {!canUseSerial() && !canUseBluetooth() && (
            <p className="text-xs text-gray-500 italic">Use Chrome or Edge to connect a thermal printer</p>
          )}
        </div>
      )}

      {/* Paper width */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Paper:</span>
        {([58, 80] as const).map((w) => (
          <button
            key={w}
            onClick={() => setPaperWidth(w)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${
              paperWidth === w
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white border-gray-200 hover:bg-gray-50"
            }`}
          >{w}mm</button>
        ))}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-2">
        {connection && (
          <button
            onClick={handleThermalPrint}
            disabled={printing}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              printSuccess
                ? "bg-green-600 text-white"
                : "bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50"
            }`}
          >
            {printing ? (
              <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Printing…</>
            ) : printSuccess ? (
              <><CheckCircle2 className="w-4 h-4" /> Printed!</>
            ) : (
              <><Printer className="w-4 h-4" /> Print</>
            )}
          </button>
        )}
        <button
          onClick={handleBrowserPrint}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
        >
          Save PDF
        </button>
      </div>
    </div>
  );
}