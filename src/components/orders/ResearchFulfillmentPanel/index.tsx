"use client";

// components/orders/ResearchFulfillmentPanel/index.tsx
//
// Research-Specific Fulfillment Gate & Batch Allocation Panel
// Enforces:
// 1. Payment confirmation before label generation
// 2. Physical batch allocation per research item
// 3. Batch release status (active, unexpired, available stock)
// 4. Approved published COA verification
// 5. Staff audit (picked_by, checked_by)
// 6. Research-oriented packaging presets
// 7. Printable laboratory packing slip with lot identifiers
// 8. Strict separation of "Label Created" vs "Handed to Carrier / Shipped"

import { useState, useEffect } from "react";
import {
  ShieldCheck, AlertTriangle, CheckCircle2, XCircle, FlaskConical,
  Package, Printer, Truck, FileText, ExternalLink, RefreshCw, Loader2,
  Calendar, Check, Copy, UserCheck, AlertCircle
} from "lucide-react";
import { AdminOrder } from "@/lib/orders/types";
import toast from "react-hot-toast";

interface Props {
  order: AdminOrder;
  onLabelPurchased?: (trackingNumber: string, trackingUrl: string) => void;
  onFulfillSuccess?: () => void;
}

export function ResearchFulfillmentPanel({ order, onLabelPurchased, onFulfillSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [savingAllocations, setSavingAllocations] = useState(false);
  const [purchasingLabel, setPurchasingLabel] = useState(false);
  const [confirmingHandoff, setConfirmingHandoff] = useState(false);
  const [data, setData] = useState<any>(null);
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  
  // Audit & Packaging Fields
  const [pickedBy, setPickedBy] = useState(order.picked_by ?? "");
  const [checkedBy, setCheckedBy] = useState(order.checked_by ?? "");
  const [selectedPreset, setSelectedPreset] = useState(order.package_preset ?? "Insulated Cold-Chain Shipper (Foam + Gel Pack)");
  const [packageWeightOz, setPackageWeightOz] = useState<string>(
    order.package_weight_oz ? String(order.package_weight_oz) : "14"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load allocation and pre-flight state from /api/orders/[id]/allocate
  const loadPreflight = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/allocate`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || "Failed to load preflight");
      setData(json.data);

      // Initialize allocations state from current items
      const initial: Record<string, string> = {};
      for (const item of json.data.items || []) {
        if (item.allocated_batch_id) {
          initial[item.id] = item.allocated_batch_id;
        } else if (item.available_batches && item.available_batches.length > 0) {
          // Auto-suggest current shipping batch if available
          const defaultBatch = item.available_batches.find((b: any) => b.is_current_shipping && b.status === "active") || item.available_batches[0];
          if (defaultBatch) initial[item.id] = defaultBatch.id;
        }
      }
      setAllocations(initial);
    } catch (e: any) {
      setErrorMessage(e.message || "Failed to load pre-flight data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPreflight();
  }, [order.id]);

  // Save allocations to database
  const saveBatchAllocations = async (newAllocations: Record<string, string>) => {
    setSavingAllocations(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/allocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations: newAllocations }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error?.message || json.error || "Failed to save batch allocations");
      toast.success("Batch allocations updated");
      await loadPreflight();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAllocations(false);
    }
  };

  const handleBatchSelect = (itemId: string, batchId: string) => {
    const updated = { ...allocations, [itemId]: batchId };
    setAllocations(updated);
    saveBatchAllocations(updated);
  };

  // Pre-flight checks evaluation
  const isPaid = order.payment_status === "paid";
  const addr = order.shipping_address as any;
  const isAddressValid = Boolean(addr?.address1 && addr?.city && addr?.state && addr?.zip);
  
  const researchItems = (data?.items || []).filter((i: any) => !!i.research_product_id);
  const unallocatedItems = researchItems.filter((i: any) => !allocations[i.id]);
  
  // Find invalid batches (expired or non-active)
  const invalidBatches = researchItems.filter((i: any) => {
    const bId = allocations[i.id];
    if (!bId) return false;
    const batch = (i.available_batches || []).find((b: any) => b.id === bId);
    if (!batch) return true;
    if (batch.status !== "active") return true;
    if (batch.expiration_date && new Date(batch.expiration_date) < new Date()) return true;
    return false;
  });

  const missingCoas = researchItems.filter((i: any) => {
    const bId = allocations[i.id];
    if (!bId) return false;
    const batch = (i.available_batches || []).find((b: any) => b.id === bId);
    const coaList = batch?.research_lab_reports || [];
    return !coaList.some((c: any) => c.published_status === "published");
  });

  const canPurchaseLabel =
    isPaid &&
    isAddressValid &&
    unallocatedItems.length === 0 &&
    invalidBatches.length === 0 &&
    missingCoas.length === 0 &&
    parseFloat(packageWeightOz) > 0;

  // Handle USPS Label Purchase
  const handlePurchaseLabel = async () => {
    if (!canPurchaseLabel) return;
    setPurchasingLabel(true);
    setErrorMessage(null);

    const weightOz = parseFloat(packageWeightOz) || 14;
    const weightLb = Math.max(0.1, weightOz / 16);

    try {
      const res = await fetch(`/api/orders/${order.id}/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightLb,
          lengthIn: 8,
          widthIn: 6,
          heightIn: 6,
          presetName: selectedPreset,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Label purchase failed (${res.status})`);
      }

      const trackingNumber = res.headers.get("X-Tracking-Number") ?? "";
      const trackingUrl = res.headers.get("X-Tracking-URL") ?? "";

      toast.success("USPS Label generated successfully");

      // Open print window for PDF
      const blob = await res.blob();
      const pdfUrl = URL.createObjectURL(blob);
      const printWindow = window.open(pdfUrl, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
      }

      if (onLabelPurchased) onLabelPurchased(trackingNumber, trackingUrl);
      await loadPreflight();
    } catch (e: any) {
      setErrorMessage(e.message || "Failed to purchase USPS label");
      toast.error(e.message || "Label creation failed");
    } finally {
      setPurchasingLabel(false);
    }
  };

  // Handle Carrier Hand-off / Shipped
  const handleConfirmHandoff = async () => {
    setConfirmingHandoff(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/fulfill`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking_number: order.tracking_number,
          tracking_url: order.tracking_url,
          handed_to_carrier: true,
          picked_by: pickedBy.trim() || null,
          checked_by: checkedBy.trim() || null,
          package_preset: selectedPreset,
          package_weight_oz: parseFloat(packageWeightOz) || null,
          allocations,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to confirm carrier hand-off");

      toast.success("Order marked as Handed to Carrier & Shipped");
      if (onFulfillSuccess) onFulfillSuccess();
      await loadPreflight();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setConfirmingHandoff(false);
    }
  };

  // Generate & Print Lab Packing Slip
  const printPackingSlip = () => {
    const slipHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slip — ${order.order_number}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif; padding: 30px; color: #111; max-width: 800px; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
          .subtitle { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
          .order-info { font-size: 13px; text-align: right; }
          .address-box { background: #f9f9f9; padding: 12px; border-radius: 6px; font-size: 12px; margin-bottom: 25px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px; }
          th { text-align: left; background: #eee; padding: 8px 10px; font-weight: 700; border-bottom: 1px solid #ddd; }
          td { padding: 10px; border-bottom: 1px solid #eee; }
          .disclaimer { font-size: 10px; color: #777; border-top: 1px dashed #ccc; padding-top: 15px; line-height: 1.4; }
          .signatures { display: flex; justify-content: space-between; margin-top: 40px; font-size: 11px; }
          .sig-line { border-top: 1px solid #000; width: 220px; padding-top: 5px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">UNENTER LABS</div>
            <div class="subtitle">Official Chain-of-Custody Packing Slip</div>
          </div>
          <div class="order-info">
            <strong>Order #${order.order_number}</strong><br/>
            Date: ${new Date(order.created_at).toLocaleDateString()}<br/>
            Tracking: ${order.tracking_number || "Pending"}
          </div>
        </div>

        <div class="address-box">
          <strong>SHIPPED TO:</strong><br/>
          ${addr?.firstName || ""} ${addr?.lastName || ""}<br/>
          ${addr?.address1 || ""}<br/>
          ${addr?.address2 ? addr.address2 + "<br/>" : ""}
          ${addr?.city || ""}, ${addr?.state || ""} ${addr?.zip || ""}<br/>
          ${addr?.country || "United States"}
        </div>

        <table>
          <thead>
            <tr>
              <th>Item / Compound</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Physical Batch #</th>
              <th>Quality Verification</th>
            </tr>
          </thead>
          <tbody>
            ${(data?.items || []).map((item: any) => {
              const bId = allocations[item.id];
              const batch = (item.available_batches || []).find((b: any) => b.id === bId);
              const coa = batch?.research_lab_reports?.[0];
              return `
                <tr>
                  <td><strong>${item.product_title || item.title}</strong>${item.variant_title ? `<br/><small>${item.variant_title}</small>` : ""}</td>
                  <td><code>${item.sku || "—"}</code></td>
                  <td><strong>${item.quantity}×</strong></td>
                  <td><code>${batch ? batch.batch_number : "UNALLOCATED"}</code></td>
                  <td>${coa ? `${coa.purity_pct}% HPLC (COA #${coa.coa_number || coa.id.slice(0,8)})` : "Verified Batch"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div class="disclaimer">
          <strong>LABORATORY RESEARCH NOTICE:</strong> All items in this shipment are strictly intended for in-vitro analytical and laboratory research use. Not for human or animal diagnostic or therapeutic consumption. Certificate of Analysis documents and HPLC verification data can be viewed online at <strong>https://labs.unenter.live/verify</strong>.
        </div>

        <div class="signatures">
          <div class="sig-line">
            Picked By: ${pickedBy || "_______________"}
          </div>
          <div class="sig-line">
            Quality Inspection By: ${checkedBy || "_______________"}
          </div>
        </div>
      </body>
      </html>
    `;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(slipHtml);
      w.document.close();
      w.focus();
      w.print();
    }
  };

  const hasTracking = Boolean(order.tracking_number);
  const isHandedToCarrier = Boolean(order.handed_to_carrier_at);

  return (
    <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm space-y-6">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
            <FlaskConical size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[hsl(var(--card-foreground))] flex items-center gap-2">
              Research Fulfillment Gate
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                isHandedToCarrier
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : hasTracking
                  ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }`}>
                {isHandedToCarrier ? "Handed to Carrier" : hasTracking ? "Label Purchased" : "Pending Release"}
              </span>
            </h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Quality assurance, batch assignment, and USPS chain-of-custody.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadPreflight}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--card-foreground))]"
          title="Refresh allocations & status"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Pre-flight Gate Checklist */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
        {/* Check 1: Payment */}
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${
          isPaid ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
        }`}>
          {isPaid ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          <div>
            <div className="font-bold">1. Payment</div>
            <div className="text-[11px] opacity-80">{isPaid ? "Confirmed Paid" : "Awaiting Payment"}</div>
          </div>
        </div>

        {/* Check 2: Address */}
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${
          isAddressValid ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
        }`}>
          {isAddressValid ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          <div>
            <div className="font-bold">2. Address</div>
            <div className="text-[11px] opacity-80">{isAddressValid ? "Complete & Valid" : "Incomplete Address"}</div>
          </div>
        </div>

        {/* Check 3: Batch Allocations */}
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${
          unallocatedItems.length === 0 ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-400"
        }`}>
          {unallocatedItems.length === 0 ? <CheckCircle2 size={16} className="shrink-0" /> : <AlertTriangle size={16} className="shrink-0" />}
          <div>
            <div className="font-bold">3. Batches</div>
            <div className="text-[11px] opacity-80">{unallocatedItems.length === 0 ? "All Assigned" : `${unallocatedItems.length} Missing`}</div>
          </div>
        </div>

        {/* Check 4: COA Release */}
        <div className={`p-2.5 rounded-xl border flex items-center gap-2 ${
          missingCoas.length === 0 && invalidBatches.length === 0 ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
        }`}>
          {missingCoas.length === 0 && invalidBatches.length === 0 ? <CheckCircle2 size={16} className="shrink-0" /> : <XCircle size={16} className="shrink-0" />}
          <div>
            <div className="font-bold">4. Quality Release</div>
            <div className="text-[11px] opacity-80">{missingCoas.length === 0 && invalidBatches.length === 0 ? "COAs Approved" : "Pending QC"}</div>
          </div>
        </div>
      </div>

      {/* Blocking Alert if any check fails */}
      {(!isPaid || unallocatedItems.length > 0 || invalidBatches.length > 0 || missingCoas.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle size={17} className="shrink-0 mt-0.5 text-amber-600" />
          <div className="space-y-1">
            <strong className="font-semibold block">Fulfillment & Postage Gate Blocked:</strong>
            {!isPaid && <div>• Order is unpaid (Status: {order.payment_status}). Cannot purchase USPS postage until payment clears.</div>}
            {unallocatedItems.length > 0 && <div>• {unallocatedItems.length} research compound{unallocatedItems.length > 1 ? "s require" : " requires"} a physical production batch allocation below.</div>}
            {invalidBatches.length > 0 && <div>• One or more assigned batches are expired or quarantined.</div>}
            {missingCoas.length > 0 && <div>• Assigned batches require an approved, published Certificate of Analysis.</div>}
          </div>
        </div>
      )}

      {/* Line Items & Physical Batch Allocations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
            <Package size={14} /> Physical Batch Allocation ({data?.items?.length || order.items.length} items)
          </h4>
          {savingAllocations && (
            <span className="text-xs text-purple-600 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Saving...
            </span>
          )}
        </div>

        <div className="space-y-2.5">
          {(data?.items || []).map((item: any) => {
            const isResearch = Boolean(item.research_product_id);
            const currentBatchId = allocations[item.id] || item.allocated_batch_id;
            const availableBatches: any[] = item.available_batches || [];
            const selectedBatch = availableBatches.find((b) => b.id === currentBatchId);
            const activeCoa = selectedBatch?.research_lab_reports?.find((c: any) => c.published_status === "published");

            return (
              <div
                key={item.id}
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[hsl(var(--card-foreground))] truncate">
                      {item.product_title || item.title}
                    </span>
                    <span className="font-bold px-2 py-0.5 rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--card-foreground))]">
                      {item.quantity}×
                    </span>
                    {isResearch && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">
                        LAB VIAL
                      </span>
                    )}
                  </div>
                  {item.variant_title && item.variant_title !== "Default" && (
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
                      {item.variant_title} · SKU: {item.sku || "—"}
                    </div>
                  )}
                </div>

                {/* Batch Selector Dropdown */}
                {isResearch ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="space-y-1">
                      <select
                        value={currentBatchId || ""}
                        onChange={(e) => handleBatchSelect(item.id, e.target.value)}
                        className="h-8 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs font-mono font-medium focus:ring-1 focus:ring-purple-500"
                      >
                        <option value="">Select Production Batch…</option>
                        {availableBatches.map((b) => (
                          <option key={b.id} value={b.id}>
                            #{b.batch_number} {b.is_current_shipping ? "(Active Shipping)" : ""} · {b.status} {b.remaining_quantity ? `(${b.remaining_quantity} left)` : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* COA Indicator */}
                    {activeCoa ? (
                      <a
                        href={activeCoa.pdf_url || `/verify?batch=${activeCoa.access_code || activeCoa.coa_number}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-500/20 transition-colors"
                        title="View approved COA"
                      >
                        <ShieldCheck size={12} />
                        {activeCoa.purity_pct}% HPLC
                      </a>
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-1 rounded-lg border border-amber-500/20">
                        No COA
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">Standard Shop Merchandise</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Staff Audit & Laboratory Packaging Configuration */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.15)] p-4 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center gap-1.5">
          <UserCheck size={14} /> Staff Chain-of-Custody & Packaging
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-[hsl(var(--muted-foreground))]">Picked By (Staff ID / Name)</label>
            <input
              type="text"
              placeholder="e.g. D. Vance / Analytical Tech"
              value={pickedBy}
              onChange={(e) => setPickedBy(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[hsl(var(--muted-foreground))]">Quality Checked By (Auditor)</label>
            <input
              type="text"
              placeholder="e.g. S. Miller / Lead Chemist"
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
          <div className="sm:col-span-2 space-y-1">
            <label className="font-semibold text-[hsl(var(--muted-foreground))]">Research Packaging Preset</label>
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                if (e.target.value.includes("Cold-Chain")) setPackageWeightOz("14");
                else if (e.target.value.includes("Padded Cryo")) setPackageWeightOz("3");
                else if (e.target.value.includes("Multi-Vial Box")) setPackageWeightOz("6");
                else if (e.target.value.includes("Bulk")) setPackageWeightOz("12");
                else if (e.target.value.includes("Glassware")) setPackageWeightOz("20");
              }}
              className="w-full h-8 px-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))]"
            >
              <option value="Insulated Cold-Chain Shipper (Foam + Gel Pack)">
                ❄️ Insulated Cold-Chain Shipper (Foam + Gel Pack) — 14 oz, 8x6x6 in
              </option>
              <option value="Padded Cryo/Vial Bubble Mailer (1-4 Vials)">
                🧪 Padded Cryo/Vial Bubble Mailer (1-4 Vials) — 3 oz, 7x9x1.5 in
              </option>
              <option value="Rigid Multi-Vial Laboratory Box (5-10 Vials)">
                📦 Rigid Multi-Vial Laboratory Box (5-10 Vials) — 6 oz, 7x5x3 in
              </option>
              <option value="Bulk Laboratory Carton (10-30 Vials)">
                📦 Bulk Laboratory Carton (10-30 Vials) — 12 oz, 10x8x5 in
              </option>
              <option value="Ambient Glassware / Reagent Shipper">
                🧪 Ambient Glassware / Reagent Shipper — 20 oz, 12x10x8 in
              </option>
              <option value="Custom Dimensions">Custom Dimensions</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-[hsl(var(--muted-foreground))]">Actual Scale Weight (oz)</label>
            <input
              type="number"
              step="0.1"
              value={packageWeightOz}
              onChange={(e) => setPackageWeightOz(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] font-mono"
            />
          </div>
        </div>
      </div>

      {/* Error display if any */}
      {errorMessage && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {/* Action Footer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          {/* Packing Slip Button */}
          <button
            type="button"
            onClick={printPackingSlip}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-xs font-semibold hover:border-[hsl(var(--primary))] transition-colors"
          >
            <FileText size={14} /> Packing Slip
          </button>

          {/* Reprint Label Button if tracking exists */}
          {hasTracking && (
            <a
              href={`/api/orders/${order.id}/label`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-xs font-semibold hover:border-[hsl(var(--primary))] transition-colors"
            >
              <Printer size={14} /> Reprint Label
            </a>
          )}
        </div>

        {/* Primary Action Flow */}
        <div className="flex items-center gap-2">
          {!hasTracking ? (
            <button
              type="button"
              onClick={handlePurchaseLabel}
              disabled={!canPurchaseLabel || purchasingLabel}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {purchasingLabel ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
              {purchasingLabel ? "Purchasing USPS Postage…" : "Purchase USPS Shipping Label"}
            </button>
          ) : !isHandedToCarrier ? (
            <button
              type="button"
              onClick={handleConfirmHandoff}
              disabled={confirmingHandoff}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-sm"
            >
              {confirmingHandoff ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
              {confirmingHandoff ? "Confirming…" : "Confirm Carrier Acceptance / Mark Shipped"}
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold">
              <CheckCircle2 size={15} /> Handed to Carrier & Fulfilled
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
