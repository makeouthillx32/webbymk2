'use client';

// components/orders/OrderGrid/index.tsx
// CustomerTypeBadge now handles three states: Member | Guest | POS (In-Person)
// The mobile card and desktop row both show the badge.
// Filter is expanded to include 'pos' via the customerTypeFilter prop.

import React, { useState } from 'react';
import { AdminOrder, FulfillmentStatus } from '@/lib/orders/types';
import { OrderContextMenu } from '../ContextMenu';
import { MoreHorizontal, Printer, CheckCircle2, User, Star, ShoppingBag } from 'lucide-react';

interface OrderGridProps {
  orders: AdminOrder[];
  selectedIds: string[];
  onSelectChange: (ids: string[]) => void;
  onRowClick: (order: AdminOrder) => void;
  onFulfill: (order: AdminOrder, trackingNumber?: string) => Promise<void>;
  onPrint: (order: AdminOrder) => void;
}

// ── Fulfillment badge ──────────────────────────────────────────────
const FULFILLMENT_STYLES: Record<FulfillmentStatus, string> = {
  unfulfilled: 'bg-amber-50 text-amber-700 border-amber-200',
  partial:     'bg-blue-50 text-blue-700 border-blue-200',
  fulfilled:   'bg-green-50 text-green-700 border-green-200',
  returned:    'bg-red-50 text-red-700 border-red-200',
  cancelled:   'bg-gray-100 text-gray-500 border-gray-200',
};
const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  unfulfilled: 'Unfulfilled',
  partial:     'Partial',
  fulfilled:   'Fulfilled',
  returned:    'Returned',
  cancelled:   'Cancelled',
};

function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  const s = FULFILLMENT_STYLES[status] ?? FULFILLMENT_STYLES.unfulfilled;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${s}`}>
      {FULFILLMENT_LABEL[status] ?? 'Unfulfilled'}
    </span>
  );
}

// ── Customer type badge ────────────────────────────────────────────
// Three mutually exclusive states:
//   POS    → in-person admin sale  (purple, ShoppingBag icon)
//   Member → logged-in web order   (yellow, Star icon)
//   Guest  → anonymous web order   (gray, User icon)
function CustomerTypeBadge({ order }: { order: AdminOrder }) {
  if (order.is_pos) {
    return (
      <span
        title="In-person sale via POS"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-purple-50 text-purple-700 border-purple-200"
      >
        <ShoppingBag className="w-2.5 h-2.5" />
        POS
      </span>
    );
  }
  if (order.is_member) {
    return (
      <span
        title={`Member · ${order.points_earned} pts earned`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-yellow-50 text-yellow-700 border-yellow-200"
      >
        <Star className="w-2.5 h-2.5 fill-yellow-500 text-yellow-500" />
        Member
      </span>
    );
  }
  return (
    <span
      title="Guest order"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border bg-gray-50 text-gray-500 border-gray-200"
    >
      <User className="w-2.5 h-2.5" />
      Guest
    </span>
  );
}

// ── Mobile card ────────────────────────────────────────────────────
function OrderCard({
  order, isSelected, onSelect, onRowClick, onFulfill, onPrint,
}: {
  order: AdminOrder;
  isSelected: boolean;
  onSelect: () => void;
  onRowClick: () => void;
  onFulfill: () => void;
  onPrint: () => void;
}) {
  const customerName = [order.customer_first_name, order.customer_last_name]
    .filter(Boolean).join(' ') || null;

  return (
    <div
      className={`rounded-lg border p-4 cursor-pointer transition-colors ${
        isSelected ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
      }`}
      onClick={onRowClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold font-mono text-sm">#{order.order_number}</span>
              <CustomerTypeBadge order={order} />
            </div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {customerName ?? order.email}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric',
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="font-mono font-bold text-sm">${(order.total_cents / 100).toFixed(2)}</span>
          <FulfillmentBadge status={order.fulfillment_status} />
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            order.payment_status === 'paid'
              ? 'bg-green-50 text-green-700 border-green-100'
              : 'bg-amber-50 text-amber-700 border-amber-100'
          }`}>
            {order.payment_status?.toUpperCase()}
          </span>
          {/* Points pill on mobile */}
          {order.is_member && order.points_earned > 0 && (
            <span className="text-[10px] text-yellow-600 font-semibold">+{order.points_earned} pts</span>
          )}
        </div>

        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* POS orders don't need a shipping label */}
          {!order.is_pos && (
            <button title="Print label" onClick={onPrint}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
              <Printer className="w-4 h-4" />
            </button>
          )}
          {order.fulfillment_status !== 'fulfilled' && (
            <button title="Mark fulfilled" onClick={onFulfill}
              className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-700 transition-colors">
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main grid ──────────────────────────────────────────────────────
export function OrderGrid({ orders, selectedIds, onSelectChange, onRowClick, onFulfill, onPrint }: OrderGridProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; order: AdminOrder } | null>(null);
  const [fulfilling, setFulfilling] = useState<string | null>(null);

  const toggleAll = () => {
    if (selectedIds.length === orders.length) onSelectChange([]);
    else onSelectChange(orders.map((o) => o.id));
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) onSelectChange(selectedIds.filter((i) => i !== id));
    else onSelectChange([...selectedIds, id]);
  };

  const handleContextMenu = (e: React.MouseEvent, order: AdminOrder) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, order });
  };

  const handleFulfillClick = async (e: React.MouseEvent, order: AdminOrder) => {
    e.stopPropagation();
    setFulfilling(order.id);
    try {
      await onFulfill(order);
    } catch (err: any) {
      alert(err.message ?? 'Failed to mark fulfilled');
    } finally {
      setFulfilling(null);
    }
  };

  const handleContextAction = (action: string, order: AdminOrder) => {
    if (action === 'view') onRowClick(order);
    if (action === 'print_receipt' || action === 'print') onPrint(order);
    if (action === 'mark_shipped') onFulfill(order);
    if (action === 'copy_id') navigator.clipboard.writeText(order.id).catch(() => {});
  };

  const isBusy = (id: string) => fulfilling === id;

  // ── Mobile ────────────────────────────────────────────────────
  return (
    <div>
      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isSelected={selectedIds.includes(order.id)}
            onSelect={() => toggleOne(order.id)}
            onRowClick={() => onRowClick(order)}
            onFulfill={() => onFulfill(order)}
            onPrint={() => onPrint(order)}
          />
        ))}
        {orders.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">No orders match your filters</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === orders.length}
                  ref={(el) => {
                    if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < orders.length;
                  }}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Order</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Customer</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Payment</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  No orders match your filters
                </td>
              </tr>
            )}
            {orders.map((order) => {
              const customerName = [order.customer_first_name, order.customer_last_name]
                .filter(Boolean).join(' ') || order.email;

              return (
                <tr
                  key={order.id}
                  onClick={() => onRowClick(order)}
                  onContextMenu={(e) => handleContextMenu(e, order)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(order.id)}
                      onChange={() => toggleOne(order.id)}
                    />
                  </td>

                  {/* Order number + type badge */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">#{order.order_number}</span>
                      <CustomerTypeBadge order={order} />
                    </div>
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                    {customerName}
                  </td>

                  {/* Date */}
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(order.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </td>

                  {/* Fulfillment */}
                  <td className="px-4 py-3">
                    <FulfillmentBadge status={order.fulfillment_status ?? 'unfulfilled'} />
                  </td>

                  {/* Payment */}
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                      order.payment_status === 'paid'
                        ? 'bg-green-50 text-green-700 border-green-100'
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                    }`}>
                      {order.payment_status?.toUpperCase()}
                    </span>
                  </td>

                  {/* Total */}
                  <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                    ${(order.total_cents / 100).toFixed(2)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {/* Hide print for POS orders — no label needed */}
                      {!order.is_pos && (
                        <button title="Print label" onClick={() => onPrint(order)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                      {order.fulfillment_status !== 'fulfilled' && (
                        <button
                          title="Mark fulfilled"
                          disabled={isBusy(order.id)}
                          onClick={(e) => handleFulfillClick(e, order)}
                          className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-700 disabled:opacity-40 transition-colors"
                        >
                          <CheckCircle2 className={`w-4 h-4 ${isBusy(order.id) ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        title="More actions"
                        onClick={(e) => { e.stopPropagation(); handleContextMenu(e, order); }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <OrderContextMenu
          {...menu}
          onClose={() => setMenu(null)}
          onAction={(action, order) => handleContextAction(action, order)}
        />
      )}
    </div>
  );
}