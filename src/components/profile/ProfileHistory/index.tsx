'use client';

// components/profile/ProfileHistory/index.tsx
// Self-contained purchase history panel — drop it anywhere inside /profile/me.
// Fetches /api/account/history on mount. Handles loading, empty, and error states.
// Prices are hard-snapshotted at purchase time — never reflect current product price.

import { useEffect, useState } from 'react';
import { History, ChevronDown, ChevronUp, Truck, ExternalLink } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
interface HistoryItem {
  id: string;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string;
  sku?: string;
  quantity: number;
  price_cents: number;
  compare_at_price_cents?: number;
  currency: string;
  product_snapshot?: any;
}

interface PurchaseOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  total_cents: number;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  currency: string;
  promo_code?: string;
  shipping_method_name?: string;
  shipping_address?: any;
  customer_email?: string;
  email?: string;
  order_items: HistoryItem[];
}

// ── Helpers ────────────────────────────────────────────────────────
function fmt(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const PAYMENT_STYLE: Record<string, string> = {
  paid:     'text-green-700 bg-green-50 border-green-200',
  refunded: 'text-gray-500 bg-gray-50 border-gray-200',
  failed:   'text-red-700 bg-red-50 border-red-200',
  pending:  'text-yellow-700 bg-yellow-50 border-yellow-200',
};

const STATUS_STYLE: Record<string, string> = {
  pending:    'text-yellow-700 bg-yellow-50 border-yellow-200',
  processing: 'text-blue-700 bg-blue-50 border-blue-200',
  shipped:    'text-purple-700 bg-purple-50 border-purple-200',
  delivered:  'text-green-700 bg-green-50 border-green-200',
  cancelled:  'text-red-700 bg-red-50 border-red-200',
  refunded:   'text-gray-500 bg-gray-50 border-gray-200',
};

// ── Loading skeleton ───────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="animate-pulse space-y-3">
      {[1, 2].map((i) => (
        <div key={i} className="border border-gray-100 rounded-xl p-4 space-y-2">
          <div className="flex justify-between">
            <div className="h-4 bg-gray-100 rounded w-32" />
            <div className="h-4 bg-gray-100 rounded w-16" />
          </div>
          <div className="h-3 bg-gray-100 rounded w-44" />
          <div className="h-3 bg-gray-100 rounded w-28" />
        </div>
      ))}
    </div>
  );
}

// ── Individual order card ──────────────────────────────────────────
function HistoryCard({ order }: { order: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  const paymentStyle = PAYMENT_STYLE[order.payment_status] ?? 'text-gray-500 bg-gray-50 border-gray-200';
  const statusStyle  = STATUS_STYLE[order.status] ?? 'text-gray-500 bg-gray-50 border-gray-200';
  const addr = order.shipping_address;
  const totalItems = order.order_items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
      {/* ── Header row ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50/60 transition-colors text-left"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wider text-gray-900">
              {order.order_number}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${paymentStyle}`}>
              {order.payment_status}
            </span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border capitalize ${statusStyle}`}>
              {order.status}
            </span>
          </div>
          <span className="text-xs text-gray-400">{fmtDate(order.created_at)}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          <span className="font-semibold text-sm text-gray-900">
            {fmt(order.total_cents, order.currency)}
          </span>
          {open
            ? <ChevronUp className="w-4 h-4 text-gray-400" />
            : <ChevronDown className="w-4 h-4 text-gray-400" />
          }
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {open && (
        <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-4 space-y-4 text-sm">

          {/* Items list */}
          <div className="space-y-2">
            {order.order_items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-gray-100 text-gray-700 font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                    {item.quantity}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{item.product_title}</div>
                    {item.variant_title && item.variant_title !== 'Default' && (
                      <div className="text-xs text-gray-500">{item.variant_title}</div>
                    )}
                    {item.sku && (
                      <div className="font-mono text-[10px] text-gray-400">SKU: {item.sku}</div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono text-gray-700">
                    {fmt(item.price_cents * item.quantity, item.currency)}
                  </span>
                  <div className="text-[10px] text-gray-400">
                    {fmt(item.price_cents, item.currency)} ea.
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'items'})</span>
              <span>{fmt(order.subtotal_cents, order.currency)}</span>
            </div>
            {order.discount_cents > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount{order.promo_code ? ` (${order.promo_code})` : ''}</span>
                <span>−{fmt(order.discount_cents, order.currency)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Shipping{order.shipping_method_name ? ` (${order.shipping_method_name})` : ''}</span>
              <span>{order.shipping_cents > 0 ? fmt(order.shipping_cents, order.currency) : 'FREE'}</span>
            </div>
            {order.tax_cents > 0 && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{fmt(order.tax_cents, order.currency)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{fmt(order.total_cents, order.currency)}</span>
            </div>
          </div>

          {/* Shipping address */}
          {addr && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Shipped To
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                {addr.full_name && <div>{addr.full_name}</div>}
                {addr.line1 && <div>{addr.line1}</div>}
                {addr.line2 && <div>{addr.line2}</div>}
                {(addr.city || addr.region || addr.postal_code) && (
                  <div>{[addr.city, addr.region].filter(Boolean).join(', ')} {addr.postal_code}</div>
                )}
                {addr.country && <div>{addr.country}</div>}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────
export function ProfileHistory() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetch(`/api/account/history?page=${page}&limit=10`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        setOrders(json.orders ?? []);
        setTotalPages(json.total_pages ?? 1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <section className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-bold text-gray-900">Purchase History</h2>
        {!loading && !error && orders.length > 0 && (
          <span className="text-xs text-gray-400 font-medium">
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && <Skeleton />}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-600">
          Could not load your purchase history. Please try refreshing the page.
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-12 text-center">
          <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No purchases yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Your completed orders will appear here, with prices locked in at what you paid.
          </p>
          <a
            href="/shop"
            className="mt-5 inline-block text-sm font-semibold text-gray-900 underline underline-offset-2 hover:text-gray-600 transition-colors"
          >
            Browse the shop →
          </a>
        </div>
      )}

      {/* Orders list */}
      {!loading && !error && orders.length > 0 && (
        <>
          <div className="space-y-3">
            {orders.map((order) => (
              <HistoryCard key={order.id} order={order} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-xs text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-xs font-semibold text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

    </section>
  );
}