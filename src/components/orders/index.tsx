'use client';

// components/orders/index.tsx

import { useState, useMemo, useCallback } from 'react';
import { OrderGrid } from './OrderGrid';
import { OrderToolbar, CustomerTypeFilter } from './Toolbar';
import { OrderDetailsDialog } from './OrderDetailsDialog';
import { ShippingSlip } from './Print';
import { PackagePicker } from './PackagePicker';
import { AdminOrder, FulfillmentStatus, PaymentStatus } from '@/lib/orders/types';

interface OrdersManagerProps {
  initialOrders: AdminOrder[];
}

export function OrdersManager({ initialOrders }: OrdersManagerProps) {
  const [orders, setOrders]             = useState<AdminOrder[]>(initialOrders);
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  const [editingOrder, setEditingOrder] = useState<AdminOrder | null>(null);

  // HTML packing slip — still available from context menu
  const [slipOrder, setSlipOrder]   = useState<AdminOrder | null>(null);
  // Label picker — opened from grid printer icon when no stored label exists
  const [labelOrder, setLabelOrder] = useState<AdminOrder | null>(null);

  // Filters
  const [fulfillmentFilter, setFulfillmentFilter]     = useState<FulfillmentStatus | 'all'>('all');
  const [paymentFilter, setPaymentFilter]             = useState<PaymentStatus | 'all'>('all');
  const [customerTypeFilter, setCustomerTypeFilter]   = useState<CustomerTypeFilter>('all');
  const [searchQuery, setSearchQuery]                 = useState('');

  // ── Fulfill ───────────────────────────────────────────────────
  const handleFulfill = useCallback(async (order: AdminOrder, trackingNumber?: string) => {
    const res = await fetch(`/api/orders/${order.id}/fulfill`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: trackingNumber }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? 'Failed to mark fulfilled');
    }
    const update = (o: AdminOrder) =>
      o.id === order.id
        ? { ...o, fulfillment_status: 'fulfilled' as FulfillmentStatus, tracking_number: trackingNumber ?? o.tracking_number }
        : o;
    setOrders((prev) => prev.map(update));
    setEditingOrder((prev) => prev && update(prev));
  }, []);

  // ── Print / Label ─────────────────────────────────────────────
  // Grid printer icon: POS orders skip label (open detail dialog);
  // web orders with stored label → detail dialog for reprint;
  // web orders without label → PackagePicker
  const handlePrint = useCallback((order: AdminOrder) => {
    if (order.is_pos) {
      // POS order — no label, just open details
      setEditingOrder(order);
    } else if (order.label_pdf_path) {
      // Label already paid for — open detail dialog to reprint
      setEditingOrder(order);
    } else {
      // No label yet — open PackagePicker to generate
      setLabelOrder(order);
    }
  }, []);

  const handleLabelSuccess = useCallback((trackingNumber: string, trackingUrl: string) => {
    if (!labelOrder) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === labelOrder.id
          ? { ...o, tracking_number: trackingNumber, tracking_url: trackingUrl }
          : o
      )
    );
    setLabelOrder(null);
  }, [labelOrder]);

  // HTML packing slip (paper insert)
  const handlePackingSlip = useCallback((order: AdminOrder) => {
    setSlipOrder(order);
    setTimeout(() => { window.print(); setSlipOrder(null); }, 300);
  }, []);

  // ── Batch ─────────────────────────────────────────────────────
  const handleBatchPrint = useCallback(() => {
    const first = orders.find((o) => selectedIds.includes(o.id));
    if (first) handlePrint(first);
  }, [selectedIds, orders, handlePrint]);

  const handleBatchFulfill = useCallback(async () => {
    const toFulfill = orders.filter(
      (o) => selectedIds.includes(o.id) && o.fulfillment_status !== 'fulfilled'
    );
    await Promise.allSettled(toFulfill.map((o) => handleFulfill(o)));
    setSelectedIds([]);
  }, [selectedIds, orders, handleFulfill]);

  // ── Filters ───────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (fulfillmentFilter !== 'all' && o.fulfillment_status !== fulfillmentFilter) return false;
      if (paymentFilter !== 'all' && o.payment_status !== paymentFilter) return false;
      // Customer type filter — now three buckets
      if (customerTypeFilter === 'pos'    && !o.is_pos)    return false;
      if (customerTypeFilter === 'member' && (!o.is_member || o.is_pos)) return false;
      if (customerTypeFilter === 'guest'  && (!o.is_guest  || o.is_pos)) return false;
      if (searchQuery.trim()) {
        const q    = searchQuery.toLowerCase();
        const name = [o.customer_first_name, o.customer_last_name].join(' ').toLowerCase();
        if (
          !String(o.order_number).toLowerCase().includes(q) &&
          !o.email.toLowerCase().includes(q) &&
          !name.includes(q)
        ) return false;
      }
      return true;
    });
  }, [orders, fulfillmentFilter, paymentFilter, customerTypeFilter, searchQuery]);

  return (
    <>
      {/* HTML packing slip — hidden on screen, shown by @media print */}
      {slipOrder && (
        <div className="hidden print:block">
          <ShippingSlip order={slipOrder} />
        </div>
      )}

      {/* PackagePicker — label generation for web orders */}
      {labelOrder && (
        <PackagePicker
          order={labelOrder}
          onSuccess={handleLabelSuccess}
          onClose={() => setLabelOrder(null)}
        />
      )}

      <div className="space-y-4 print:hidden">
        <OrderToolbar
          selectedCount={selectedIds.length}
          fulfillmentFilter={fulfillmentFilter}
          paymentFilter={paymentFilter}
          customerTypeFilter={customerTypeFilter}
          searchQuery={searchQuery}
          onFulfillmentFilter={setFulfillmentFilter}
          onPaymentFilter={setPaymentFilter}
          onCustomerTypeFilter={setCustomerTypeFilter}
          onSearch={setSearchQuery}
          onBatchAction={(action) => {
            if (action === 'print')   handleBatchPrint();
            if (action === 'fulfill') handleBatchFulfill();
          }}
        />

        <OrderGrid
          orders={filteredOrders}
          selectedIds={selectedIds}
          onSelectChange={setSelectedIds}
          onRowClick={setEditingOrder}
          onFulfill={handleFulfill}
          onPrint={handlePrint}
        />
      </div>

      {editingOrder && (
        <OrderDetailsDialog
          order={editingOrder}
          open={!!editingOrder}
          onOpenChange={(open) => { if (!open) setEditingOrder(null); }}
          onFulfill={handleFulfill}
          onPrint={handlePrint}
        />
      )}
    </>
  );
}