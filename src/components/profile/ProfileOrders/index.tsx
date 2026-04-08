'use client';

// components/profile/ProfileOrders/index.tsx
// Self-contained order history panel — drop it anywhere inside /profile/me.
// Fetches /api/orders/mine on mount. Handles loading, empty, and error states.

import { useEffect, useState } from 'react';
import {
  Package, ChevronDown, ChevronUp,
  Truck, Star, ExternalLink,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────
type FulfillmentStatus = 'unfulfilled' | 'partial' | 'fulfilled' | 'returned' | 'cancelled';

interface OrderItem {
  id: string;
  sku: string;
  title: string;
  variant_title?: string;
  quantity: number;
  price_cents: number;
}

interface ProfileOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  fulfillment_status: FulfillmentStatus;
  total_cents: number;
  subtotal_cents: number;
  shipping_cents: number;
  tax_cents: number;
  shipping_address: any;
  shipping_method_name?: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
  points_earned: number;
  items: OrderItem[];
}

// ── Helpers ────────────────────────────────────────────────────────
const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  unfulfilled: 'Processing',
  partial:     'Partially Shipped',
  fulfilled:   'Delivered',
  returned:    'Returned',
  cancelled:   'Cancelled',
};

const FULFILLMENT_STYLE: Record<FulfillmentStatus, string> = {
  unfulfilled: 'text-amber-700 bg-amber-50 border-amber-200',
  partial:     'text-blue-700 bg-blue-50 border-blue-200',
  fulfilled:   'text-green-700 bg-green-50 border-green-200',
  returned:    'text-red-700 bg-red-50 border-red-200',
  cancelled:   'text-gray-500 bg-gray-50 border-gray-200',
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

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
function OrderCard({ order }: { order: ProfileOrder }) {
  const [open, setOpen] = useState(false);
  const status = order.fulfillment_status ?? 'unfulfilled';
  const addr = order.shipping_address;

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">

      {/* ── Summary row (always visible) ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-4 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-bold text-sm text-gray-900">
              #{order.order_number}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${FULFILLMENT_STYLE[status]}`}>
              {FULFILLMENT_LABEL[status]}
            </span>
          </div>

          <span className="text-xs text-gray-400">
            {new Date(order.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>

          {order.points_earned > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] text-yellow-600 font-semibold">
              <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
              +{order.points_earned} points earned
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono font-bold text-gray-900 text-sm">
            {fmt(order.total_cents)}
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
            {order.items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-gray-100 text-gray-700 font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                    {item.quantity}
                  </span>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{item.title}</div>
                    {item.variant_title && item.variant_title !== 'Default' && (
                      <div className="text-xs text-gray-500">{item.variant_title}</div>
                    )}
                  </div>
                </div>
                <span className="font-mono text-gray-700 shrink-0">
                  {fmt(item.price_cents * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-500">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(order.subtotal_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span>Shipping</span>
              <span>{order.shipping_cents > 0 ? fmt(order.shipping_cents) : 'FREE'}</span>
            </div>
            {order.tax_cents > 0 && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{fmt(order.tax_cents)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm text-gray-900 pt-1 border-t border-gray-100">
              <span>Total</span>
              <span>{fmt(order.total_cents)}</span>
            </div>
          </div>

          {/* Shipping address */}
          {addr && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Shipped To
              </div>
              <div className="text-xs text-gray-600 space-y-0.5">
                <div>{[addr.firstName, addr.lastName].filter(Boolean).join(' ')}</div>
                {addr.address1 && <div>{addr.address1}</div>}
                {addr.address2 && <div>{addr.address2}</div>}
                {(addr.city || addr.state || addr.zip) && (
                  <div>{[addr.city, addr.state].filter(Boolean).join(', ')} {addr.zip}</div>
                )}
              </div>
            </div>
          )}

          {/* Tracking */}
          {order.tracking_number && (
            <div className="border-t border-gray-100 pt-3 flex items-start gap-2">
              <Truck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                  Tracking
                </div>
                {order.tracking_url ? (
                  <a
                    href={order.tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                  >
                    {order.tracking_number}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="font-mono text-xs text-gray-700">{order.tracking_number}</span>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────
export function ProfileOrders() {
  const [orders, setOrders] = useState<ProfileOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/orders/mine', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => setOrders(json.orders ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="space-y-4">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-bold text-gray-900">Order History</h2>
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
          Could not load your orders. Please try refreshing the page.
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-6 py-12 text-center">
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="font-semibold text-gray-500">No orders yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Your purchases will show up here once you place an order.
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
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}

    </section>
  );
}