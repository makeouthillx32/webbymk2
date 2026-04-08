'use client';

// components/orders/Toolbar/index.tsx

import { Search, Printer, CheckCircle2 } from 'lucide-react';
import { FulfillmentStatus, PaymentStatus } from '@/lib/orders/types';

// Extend the customer type filter to include 'pos'
export type CustomerTypeFilter = 'all' | 'member' | 'guest' | 'pos';

interface OrderToolbarProps {
  selectedCount: number;
  fulfillmentFilter: FulfillmentStatus | 'all';
  paymentFilter: PaymentStatus | 'all';
  customerTypeFilter: CustomerTypeFilter;
  searchQuery: string;
  onFulfillmentFilter: (v: FulfillmentStatus | 'all') => void;
  onPaymentFilter: (v: PaymentStatus | 'all') => void;
  onCustomerTypeFilter: (v: CustomerTypeFilter) => void;
  onSearch: (v: string) => void;
  onBatchAction: (action: 'print' | 'fulfill') => void;
}

export function OrderToolbar({
  selectedCount,
  fulfillmentFilter,
  paymentFilter,
  customerTypeFilter,
  searchQuery,
  onFulfillmentFilter,
  onPaymentFilter,
  onCustomerTypeFilter,
  onSearch,
  onBatchAction,
}: OrderToolbarProps) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search by order #, email, or name…"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/10"
        />
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Fulfillment filter */}
        <select
          value={fulfillmentFilter}
          onChange={(e) => onFulfillmentFilter(e.target.value as FulfillmentStatus | 'all')}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          <option value="all">All Fulfillment</option>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="partial">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="returned">Returned</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Payment filter */}
        <select
          value={paymentFilter}
          onChange={(e) => onPaymentFilter(e.target.value as PaymentStatus | 'all')}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          <option value="all">All Payments</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="unpaid">Unpaid</option>
          <option value="refunded">Refunded</option>
        </select>

        {/* Customer type filter — now includes POS */}
        <select
          value={customerTypeFilter}
          onChange={(e) => onCustomerTypeFilter(e.target.value as CustomerTypeFilter)}
          className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-black/10"
        >
          <option value="all">All Orders</option>
          <option value="member">Members ★</option>
          <option value="guest">Guests</option>
          <option value="pos">In-Person (POS) 🛍</option>
        </select>

        {/* Batch actions */}
        {selectedCount > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-gray-500 font-medium">{selectedCount} selected</span>
            <button
              onClick={() => onBatchAction('print')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print Slip</span>
            </button>
            <button
              onClick={() => onBatchAction('fulfill')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-black text-white hover:bg-gray-800 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="hidden sm:inline">Mark Fulfilled</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}