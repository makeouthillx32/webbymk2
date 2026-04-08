// lib/orders/resolveFulfillmentStatus.ts
//
// Resolves fulfillment_status for display, handling two sources of truth:
//
//   1. fulfillments table row  — web orders fulfilled via the dashboard workflow
//   2. orders.status column    — POS orders auto-fulfilled by the webhook
//                              — also covers cancelled/refunded at order level
//
// Priority: fulfillments table > orders.status fallback > 'unfulfilled'

import type { FulfillmentStatus } from './types';

// Maps orders.status values that carry fulfillment meaning
const STATUS_TO_FULFILLMENT: Partial<Record<string, FulfillmentStatus>> = {
  fulfilled:  'fulfilled',
  cancelled:  'cancelled',
  refunded:   'returned',
};

export function resolveFulfillmentStatus(
  fulfillmentsRow: { status: string } | null | undefined,
  orderStatus: string,
): FulfillmentStatus {
  // If a fulfillments record exists, trust it — it's the authoritative source
  // for web orders that went through the fulfillment workflow.
  if (fulfillmentsRow?.status) {
    return fulfillmentsRow.status as FulfillmentStatus;
  }

  // No fulfillment record — check if orders.status tells us something useful.
  // This covers POS orders (auto-fulfilled by webhook) and cancelled/refunded.
  return STATUS_TO_FULFILLMENT[orderStatus] ?? 'unfulfilled';
}