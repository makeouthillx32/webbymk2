'use client';

// components/orders/Print/index.tsx
// Two exports:
//
//  ShippingSlip   — HTML packing insert (tucked in the box, printed via window.print())
//  printStoredLabel(orderId) — fetches the stored PDF from Supabase Storage via
//                              GET /api/orders/[id]/label and opens it in a new tab
//                              so the browser print dialog fires on the real label.
//                              Returns tracking metadata from the response headers.

import { AdminOrder } from '@/lib/orders/types';

// ── printStoredLabel ─────────────────────────────────────────────
// Call this to reprint an already-generated (paid) label — no new USPS charge.
// The label route serves the PDF directly from Supabase Storage.

export interface LabelPrintResult {
  trackingNumber: string;
  trackingUrl: string;
  postageDollars: string;
  cached: boolean;
}

export async function printStoredLabel(orderId: string): Promise<LabelPrintResult> {
  const res = await fetch(`/api/orders/${orderId}/label`, { method: 'GET' });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Failed to fetch label (${res.status})`);
  }

  const trackingNumber  = res.headers.get('X-Tracking-Number') ?? '';
  const trackingUrl     = res.headers.get('X-Tracking-URL')    ?? '';
  const postageDollars  = res.headers.get('X-Postage')         ?? '0';
  const cached          = res.headers.get('X-Label-Cached') === 'true';

  const blob   = await res.blob();
  const pdfUrl = URL.createObjectURL(blob);

  // Open in a new tab — browser fires print dialog on load
  const win = window.open(pdfUrl, '_blank');
  if (win) {
    win.addEventListener('load', () => { win.focus(); win.print(); });
  }

  // Free the object URL after 60s
  setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);

  return { trackingNumber, trackingUrl, postageDollars, cached };
}

// ── ShippingSlip ─────────────────────────────────────────────────
// HTML packing slip — paper insert tucked in the package.
// Rendered hidden in the DOM; window.print() triggers @media print CSS
// which shows only #dcg-print-slip and hides everything else.

const STORE_NAME = 'Desert Cowgirl Co.';
const STORE_ADDRESS = [
  process.env.NEXT_PUBLIC_STORE_STREET  ?? 'Return Address Line 1',
  [
    process.env.NEXT_PUBLIC_STORE_CITY  ?? 'City',
    process.env.NEXT_PUBLIC_STORE_STATE ?? 'ST',
    process.env.NEXT_PUBLIC_STORE_ZIP   ?? 'ZIP',
  ].filter(Boolean).join(', '),
  'United States',
];

function gramsToOz(g: number): number {
  return Math.round((g / 28.3495) * 100) / 100;
}

function totalWeightOz(order: AdminOrder, extraOz: number): number {
  let total = 0;
  for (const item of order.items) {
    if (item.weight_grams) total += gramsToOz(item.weight_grams) * item.quantity;
  }
  return Math.round((total + extraOz) * 100) / 100;
}

interface ShippingSlipProps {
  order: AdminOrder;
  extraWeightOz?: number;
}

export function ShippingSlip({ order, extraWeightOz = 0 }: ShippingSlipProps) {
  const addr = order.shipping_address;
  const customerName = addr
    ? [addr.firstName, addr.lastName].filter(Boolean).join(' ')
    : [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') || order.email;

  const weightOz    = totalWeightOz(order, extraWeightOz);
  const weightLb    = Math.floor(weightOz / 16);
  const remainderOz = Math.round((weightOz % 16) * 100) / 100;
  const hasWeight   = weightOz > 0;
  const hasAllItemWeights = order.items.every((i) => i.weight_grams != null);

  return (
    <div id="dcg-print-slip" className="bg-white text-black font-sans text-sm print:text-xs">
      <div className="p-8 max-w-[680px] mx-auto print:p-6 print:max-w-none">

        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
          <div>
            <div className="text-xl font-black uppercase tracking-tight">{STORE_NAME}</div>
            {STORE_ADDRESS.map((line, i) => (
              <div key={i} className="text-xs text-gray-600">{line}</div>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-gray-400 font-semibold">Order</div>
            <div className="text-2xl font-black font-mono">#{order.order_number}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {new Date(order.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })}
            </div>
          </div>
        </div>

        {/* Ship To + Package Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Ship To</div>
            <div className="font-bold text-base leading-snug">{customerName}</div>
            {addr?.address1 && <div>{addr.address1}</div>}
            {addr?.address2 && <div>{addr.address2}</div>}
            {(addr?.city || addr?.state || addr?.zip) && (
              <div>{[addr?.city, addr?.state].filter(Boolean).join(', ')} {addr?.zip}</div>
            )}
            <div>{addr?.country ?? 'United States'}</div>
            {addr?.phone && <div className="text-gray-500 text-xs mt-1">{addr.phone}</div>}
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Package Details</div>
            <div className="space-y-1.5 text-sm">
              {order.shipping_method_name && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">Service</span>
                  <span className="font-medium">{order.shipping_method_name}</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-gray-500 w-20 shrink-0">Weight</span>
                {hasWeight ? (
                  <span className="font-medium font-mono">
                    {weightLb > 0 ? `${weightLb} lb ` : ''}{remainderOz} oz
                    <span className="text-gray-400 font-normal text-xs ml-1">({weightOz} oz total)</span>
                    {!hasAllItemWeights && (
                      <span className="text-amber-600 text-xs ml-1">⚠ some items missing weight</span>
                    )}
                  </span>
                ) : (
                  <span className="text-amber-600 font-medium">No weight data — weigh manually</span>
                )}
              </div>
              {extraWeightOz > 0 && (
                <div className="flex gap-2">
                  <span className="text-gray-500 w-20 shrink-0">+ Packaging</span>
                  <span className="font-medium font-mono">{extraWeightOz} oz</span>
                </div>
              )}
              <div className="flex gap-2">
                <span className="text-gray-500 w-20 shrink-0">Items</span>
                <span className="font-medium">
                  {order.items.reduce((s, i) => s + i.quantity, 0)} item
                  {order.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            {order.tracking_number && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Tracking</div>
                <div className="font-mono text-xs break-all">{order.tracking_number}</div>
              </div>
            )}
          </div>
        </div>

        {/* Packing List */}
        <div className="mb-6">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Packing List</div>
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                <th className="text-left px-3 py-2 font-semibold w-10">Qty</th>
                <th className="text-left px-3 py-2 font-semibold">Item</th>
                <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell">SKU</th>
                <th className="text-right px-3 py-2 font-semibold">Price</th>
                <th className="text-right px-3 py-2 font-semibold">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 font-bold text-center">{item.quantity}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.title}</div>
                    {item.variant_title && item.variant_title !== 'Default' && (
                      <div className="text-xs text-gray-500">{item.variant_title}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 hidden sm:table-cell">{item.sku}</td>
                  <td className="px-3 py-2 text-right font-mono">${(item.price_cents / 100).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-gray-500">
                    {item.weight_grams
                      ? `${gramsToOz(item.weight_grams)} oz`
                      : <span className="text-amber-500">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-52 space-y-1 text-sm">
            {order.subtotal_cents != null && (
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>${(order.subtotal_cents / 100).toFixed(2)}</span>
              </div>
            )}
            {(order.shipping_cents ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping</span>
                <span>${(order.shipping_cents! / 100).toFixed(2)}</span>
              </div>
            )}
            {(order.shipping_cents ?? 0) === 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Shipping</span>
                <span className="text-green-600">FREE</span>
              </div>
            )}
            {(order.tax_cents ?? 0) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>
                <span>${(order.tax_cents! / 100).toFixed(2)}</span>
              </div>
            )}
            {(order.discount_cents ?? 0) > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Discount</span>
                <span>–${(order.discount_cents! / 100).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base border-t border-gray-200 pt-1 mt-1">
              <span>Total</span>
              <span>${(order.total_cents / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 pt-4 text-center text-xs text-gray-400">
          Thank you for your order! Questions? Email us at hello@desertcowgirlco.com
        </div>
      </div>
    </div>
  );
}