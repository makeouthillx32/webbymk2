'use client';

// components/orders/OrderDetailsDialog/index.tsx

import { useState } from 'react';
import { AdminOrder } from '@/lib/orders/types';
import {
  X, Printer, CheckCircle2, Package, MapPin,
  Star, User, Loader2, RefreshCw, ShoppingBag,
  Upload, Check, Eye, AlertCircle, FileText, FlaskConical,
} from 'lucide-react';
import { PackagePicker } from '../PackagePicker';
import { printStoredLabel } from '../Print';
import { ReprintReceipt } from '../ReprintReceipt';
import { ResearchFulfillmentPanel } from '../ResearchFulfillmentPanel';

function gramsToOz(g: number) {
  return Math.round((g / 28.3495) * 100) / 100;
}

interface Props {
  order: AdminOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFulfill: (order: AdminOrder, trackingNumber?: string) => Promise<void>;
  onPrint: (order: AdminOrder) => void;
}

export function OrderDetailsDialog({ order, open, onOpenChange, onFulfill, onPrint }: Props) {
  const isResearchOrder = Boolean(order.is_research || order.items?.some((i) => !!i.research_product_id));
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl]       = useState(order.tracking_url ?? '');
  const [extraWeightOz, setExtraWeightOz]   = useState('');
  const [fulfilling, setFulfilling]         = useState(false);
  const [fulfilled, setFulfilled]           = useState(order.fulfillment_status === 'fulfilled');
  const [showPicker, setShowPicker]         = useState(false);
  const [reprinting, setReprinting]         = useState(false);
  const [labelError, setLabelError]         = useState<string | null>(null);

  // Zelle verification state
  const [paymentStatus, setPaymentStatus]   = useState(order.payment_status);
  const [zelleFile, setZelleFile]           = useState<File | null>(null);
  const [zellePreview, setZellePreview]     = useState<string | null>(null);
  const [zelleValidating, setZelleValidating] = useState(false);
  const [zelleError, setZelleError]         = useState<string | null>(null);
  const [zelleSuccess, setZelleSuccess]     = useState(false);
  const [proofUrl, setProofUrl]             = useState<string | null>(() => {
    const match = order.internal_notes?.match(/\[Zelle.*Proof\]:\s*(https?:\/\/[^\s\n|]+)/);
    return match ? match[1] : null;
  });
  const [showFullProof, setShowFullProof]   = useState(false);

  if (!open) return null;

  const addr = order.shipping_address;
  const customerName = addr
    ? [addr.firstName, addr.lastName].filter(Boolean).join(' ')
    : [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ') || order.email;

  const totalWeightGrams = order.items.reduce(
    (sum, item) => sum + (item.weight_grams ?? 0) * item.quantity, 0
  );
  const totalWeightOz   = Math.round((totalWeightGrams / 28.3495) * 100) / 100;
  const extraOz         = parseFloat(extraWeightOz) || 0;
  const packageWeightOz = Math.round((totalWeightOz + extraOz) * 100) / 100;
  const packageLb       = Math.floor(packageWeightOz / 16);
  const packageRemOz    = Math.round((packageWeightOz % 16) * 100) / 100;
  const hasAllWeights   = order.items.every((i) => i.weight_grams != null);
  const isFulfilled     = fulfilled || order.fulfillment_status === 'fulfilled';
  const hasStoredLabel  = !!order.label_pdf_path;

  async function handleReprint() {
    setReprinting(true);
    setLabelError(null);
    try {
      const result = await printStoredLabel(order.id);
      if (result.trackingNumber) setTrackingNumber(result.trackingNumber);
      if (result.trackingUrl)    setTrackingUrl(result.trackingUrl);
    } catch (err: any) {
      setLabelError(err.message ?? 'Failed to fetch label');
    } finally {
      setReprinting(false);
    }
  }

  function handleLabelSuccess(newTracking: string, newTrackingUrl: string) {
    setShowPicker(false);
    setLabelError(null);
    if (newTracking)    setTrackingNumber(newTracking);
    if (newTrackingUrl) setTrackingUrl(newTrackingUrl);
  }

  async function handleFulfill() {
    setFulfilling(true);
    try {
      await onFulfill(order, trackingNumber.trim() || undefined);
      setFulfilled(true);
    } catch (err: any) {
      alert(err.message ?? 'Failed to mark fulfilled');
    } finally {
      setFulfilling(false);
    }
  }

  function handleZelleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setZelleFile(file);
      setZelleError(null);
      const url = URL.createObjectURL(file);
      setZellePreview(url);
    }
  }

  async function handleValidateZelle() {
    if (!zelleFile) {
      setZelleError('Please choose or drop a confirmation screenshot first.');
      return;
    }
    setZelleValidating(true);
    setZelleError(null);
    try {
      const fd = new FormData();
      fd.append('file', zelleFile);
      fd.append('note', `Verified from Core Dashboard on ${new Date().toLocaleDateString()}`);

      const res = await fetch(`/api/orders/${order.id}/validate-zelle`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (data.success) {
        setPaymentStatus('paid');
        setZelleSuccess(true);
        if (data.proof_url) setProofUrl(data.proof_url);
      } else {
        setZelleError(data.error || 'Failed to validate Zelle payment.');
      }
    } catch (err: any) {
      setZelleError(err.message || 'Failed to validate payment.');
    } finally {
      setZelleValidating(false);
    }
  }

  function HeaderActionButton() {
    if (order.is_pos) {
      return <ReprintReceipt order={order} />;
    }
    if (hasStoredLabel) {
      return (
        <button
          onClick={handleReprint}
          disabled={reprinting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {reprinting
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Printing…</>
            : <><RefreshCw className="w-4 h-4" /> Reprint Label</>
          }
        </button>
      );
    }
    return null;
  }

  return (
    <>
      {showPicker && (
        <PackagePicker
          order={order}
          onSuccess={handleLabelSuccess}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={() => onOpenChange(false)}
      >
        <div
          className={`relative bg-white w-full ${isResearchOrder ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92dvh] overflow-y-auto`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold font-mono text-base">#{order.order_number}</span>
                {order.is_pos ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-purple-50 text-purple-700 border-purple-200">
                    <ShoppingBag className="w-3 h-3" /> POS
                  </span>
                ) : isResearchOrder ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-teal-50 text-teal-700 border-teal-200">
                    <FlaskConical className="w-3 h-3" /> Research Chemical
                  </span>
                ) : order.is_member ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-yellow-50 text-yellow-700 border-yellow-200">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> Member
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-gray-50 text-gray-500 border-gray-200">
                    <User className="w-3 h-3" /> Guest
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {new Date(order.created_at).toLocaleDateString('en-US', {
                  weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
                })}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <HeaderActionButton />
              <button
                onClick={() => onOpenChange(false)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">

            {labelError && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
                <span>⚠ {labelError}</span>
                <button className="ml-auto text-red-400 hover:text-red-600" onClick={() => setLabelError(null)}>×</button>
              </div>
            )}

            {/* POS banner */}
            {order.is_pos && (
              <div className="flex items-center gap-3 bg-purple-50 border border-purple-100 rounded-lg px-4 py-3">
                <ShoppingBag className="w-5 h-5 text-purple-500 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-purple-800">In-Person Sale</div>
                  <div className="text-xs text-purple-600">Processed via POS — no shipping label needed</div>
                </div>
              </div>
            )}

            {/* Status badges */}
            {(() => {
              const isZelleOrder =
                (order as any).payment_method === 'zelle' ||
                (order as any).payment_method_brand === 'zelle' ||
                order.internal_notes?.toLowerCase().includes('zelle') ||
                (order as any).customer_notes?.toLowerCase().includes('zelle');

              return (
                <>
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      isFulfilled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {isFulfilled ? 'Fulfilled' : 'Unfulfilled'}
                    </span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                      paymentStatus === 'paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {paymentStatus?.toUpperCase()}
                    </span>
                    {isZelleOrder && (
                      <span className="text-xs font-bold px-3 py-1 rounded-full border bg-purple-50 text-purple-700 border-purple-200">
                        ZELLE
                      </span>
                    )}
                  </div>

                  {/* ── Zelle Payment Validation Card ── */}
                  {isZelleOrder && (
                    <section className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">💳</span>
                          <h3 className="text-sm font-bold text-gray-900">
                            Zelle Payment Verification
                          </h3>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                          paymentStatus === 'paid'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {paymentStatus === 'paid' ? 'Verified & Paid' : 'Awaiting Screenshot Proof'}
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 leading-relaxed">
                        Customer ordered via Zelle offline transfer to <code className="font-mono font-bold text-purple-900">labs@unenter.live</code>.
                        {paymentStatus === 'paid'
                          ? ' Payment receipt has been verified. Shipping label generation and fulfillment are ready.'
                          : ' Upload a screenshot of your bank/Zelle confirmation receipt to verify payment and unlock fulfillment.'}
                      </p>

                      {zelleError && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5 flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{zelleError}</span>
                        </div>
                      )}

                      {/* If already paid / verified */}
                      {paymentStatus === 'paid' && (
                        <div className="flex items-center justify-between bg-white border border-purple-200 rounded-lg p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
                              <Check className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-gray-900">Payment Verified</div>
                              <div className="text-[11px] text-gray-500">
                                {proofUrl ? 'Screenshot proof attached' : 'Marked as verified in records'}
                              </div>
                            </div>
                          </div>

                          {proofUrl && (
                            <div className="flex items-center gap-2">
                              {proofUrl.startsWith('http') && (
                                <button
                                  type="button"
                                  onClick={() => setShowFullProof(true)}
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 border border-purple-200 bg-purple-50 px-2.5 py-1 rounded-md"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Proof
                                </button>
                              )}
                              <a
                                href={proofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                Open
                              </a>
                            </div>
                          )}
                        </div>
                      )}

                      {/* If pending: File Upload area */}
                      {paymentStatus !== 'paid' && (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center gap-3">
                            <label className="flex-1 cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleZelleFileChange}
                                className="hidden"
                              />
                              <div className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-white rounded-lg p-3 text-center transition">
                                <Upload className="w-4 h-4 mx-auto text-purple-600 mb-1" />
                                <span className="text-xs font-semibold text-gray-700">
                                  {zelleFile ? zelleFile.name : 'Choose confirmation screenshot'}
                                </span>
                                <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, or WEBP up to 10MB</p>
                              </div>
                            </label>

                            {zellePreview && (
                              <div className="h-16 w-16 rounded-lg border border-purple-200 overflow-hidden bg-white shrink-0 relative">
                                <img src={zellePreview} alt="Preview" className="h-full w-full object-cover" />
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={handleValidateZelle}
                            disabled={zelleValidating || !zelleFile}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-700 text-white rounded-lg font-semibold text-xs hover:bg-purple-800 disabled:opacity-50 transition"
                          >
                            {zelleValidating ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Uploading & Verifying...
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Confirm Zelle Payment & Mark Paid
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </section>
                  )}

                  {/* Proof Modal Viewer */}
                  {showFullProof && proofUrl && (
                    <div
                      onClick={() => setShowFullProof(false)}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                    >
                      <div className="relative max-w-xl max-h-[85vh] bg-white rounded-2xl p-4 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b pb-2">
                          <h4 className="text-xs font-bold text-gray-900">Zelle Payment Proof Screenshot</h4>
                          <button onClick={() => setShowFullProof(false)} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto rounded-lg border">
                          <img src={proofUrl} alt="Zelle Proof" className="w-full h-auto object-contain" />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* Ship To — web orders */}
            {!order.is_pos && addr && (
              <section>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  <MapPin className="w-3 h-3" /> Ship To
                </div>
                <div className="text-sm space-y-0.5">
                  {customerName && <div className="font-semibold">{customerName}</div>}
                  {addr.address1 && <div>{addr.address1}</div>}
                  {addr.address2 && <div>{addr.address2}</div>}
                  {(addr.city || addr.state || addr.zip) && (
                    <div>{[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}</div>
                  )}
                  {addr.country  && <div>{addr.country}</div>}
                  {addr.phone    && <div className="text-gray-400 pt-1">{addr.phone}</div>}
                  {order.email   && <div className="text-gray-400 pt-1">{order.email}</div>}
                </div>
              </section>
            )}

            {/* Customer — POS orders */}
            {order.is_pos && (
              <section>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  <User className="w-3 h-3" /> Customer
                </div>
                <div className="text-sm">
                  <div className="font-semibold">{customerName}</div>
                  {order.email && <div className="text-gray-400 text-xs">{order.email}</div>}
                </div>
              </section>
            )}

            {/* Items */}
            <section>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                <Package className="w-3 h-3" /> Items
              </div>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-3 items-start text-sm">
                    <span className="font-bold text-gray-900 w-5 text-right shrink-0">{item.quantity}×</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.variant_title && item.variant_title !== 'Default' && (
                        <div className="text-xs text-gray-500">{item.variant_title}</div>
                      )}
                      {item.sku && <div className="text-xs text-gray-400 font-mono">{item.sku}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold">${(item.price_cents / 100).toFixed(2)}</div>
                      {item.weight_grams && (
                        <div className="text-xs text-gray-400 font-mono">{gramsToOz(item.weight_grams)} oz</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Totals */}
            <section>
              <div className="border-t pt-3 space-y-1 text-sm">
                {order.subtotal_cents != null && (
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span><span>${(order.subtotal_cents / 100).toFixed(2)}</span>
                  </div>
                )}
                {!order.is_pos && (order.shipping_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Shipping</span><span>${(order.shipping_cents! / 100).toFixed(2)}</span>
                  </div>
                )}
                {(order.discount_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span><span>−${(order.discount_cents! / 100).toFixed(2)}</span>
                  </div>
                )}
                {(order.tax_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Tax</span><span>${(order.tax_cents! / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total</span><span>${(order.total_cents / 100).toFixed(2)}</span>
                </div>
              </div>
            </section>

            {/* Research Fulfillment Gate */}
            {isResearchOrder ? (
              <ResearchFulfillmentPanel
                order={order}
                onLabelPurchased={(newTracking, newUrl) => {
                  if (newTracking) setTrackingNumber(newTracking);
                  if (newUrl) setTrackingUrl(newUrl);
                }}
                onFulfillSuccess={() => {
                  setFulfilled(true);
                }}
              />
            ) : (
              <>
                {/* Package weight — web orders */}
                {!order.is_pos && (
                  <section>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      <Package className="w-3 h-3" /> Package Weight
                    </div>
                    {hasAllWeights ? (
                      <div className="space-y-2">
                        <div className="text-sm text-gray-600">
                          Items: <span className="font-mono font-semibold">{totalWeightOz} oz</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 shrink-0">+ Packaging (oz):</label>
                          <input
                            type="number" min="0" step="0.1" placeholder="0"
                            value={extraWeightOz}
                            onChange={(e) => setExtraWeightOz(e.target.value)}
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                          />
                        </div>
                        <div className="text-sm font-semibold">
                          Total: {packageLb > 0 ? `${packageLb} lb ` : ''}{packageRemOz} oz
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Some items are missing weight data — weigh manually.</p>
                    )}
                  </section>
                )}

                {/* Tracking — web fulfilled orders */}
                {!order.is_pos && isFulfilled && (trackingNumber || trackingUrl) && (
                  <section>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      Tracking
                    </div>
                    <div className="text-sm font-mono">{trackingNumber}</div>
                    {trackingUrl && (
                      <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        Track package →
                      </a>
                    )}
                  </section>
                )}

                {/* ── Receipt reprint — POS orders only ── */}
                {order.is_pos && (
                  <section>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      <Printer className="w-3 h-3" /> Receipt
                    </div>
                    <ReprintReceipt order={order} />
                  </section>
                )}

                {/* Mark fulfilled */}
                {!isFulfilled && (
                  <section>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                      <CheckCircle2 className="w-3 h-3" /> Mark Fulfilled
                    </div>
                    <div className="space-y-3">
                      {!order.is_pos && (
                        <div>
                          <label htmlFor="tracking" className="block text-xs text-gray-500 mb-1">
                            Tracking number
                            {trackingNumber && <span className="text-green-600 ml-1">(auto-filled from label)</span>}
                          </label>
                          <input
                            id="tracking" type="text"
                            placeholder="e.g. 9400111899223397658538"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/10"
                          />
                        </div>
                      )}
                      {!order.is_pos && !hasStoredLabel && !trackingNumber && (
                        <button
                          onClick={() => setShowPicker(true)}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 text-gray-500 rounded-lg text-sm hover:border-gray-300 hover:text-gray-700 transition-colors"
                        >
                          <Printer className="w-4 h-4" />
                          Generate shipping label first (optional)
                        </button>
                      )}
                      <button
                        onClick={handleFulfill}
                        disabled={fulfilling}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {fulfilling ? 'Marking fulfilled…' : order.is_pos ? 'Mark as Complete' : 'Mark as Fulfilled'}
                      </button>
                    </div>
                  </section>
                )}

                {/* Fulfilled confirmation */}
                {isFulfilled && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    {order.is_pos ? 'Sale complete.' : `This order has been fulfilled.${trackingNumber ? ` ${trackingNumber}` : ''}`}
                  </div>
                )}
              </>
            )}

            {/* Internal notes */}
            {order.internal_notes && (
              <section>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Notes
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{order.internal_notes}</p>
              </section>
            )}

          </div>
        </div>
      </div>
    </>
  );
}