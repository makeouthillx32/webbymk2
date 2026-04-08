'use client';

// components/orders/PackagePicker/index.tsx
// Modal that appears when admin clicks "Print Label".
// Lets them choose a package preset (or enter custom dims),
// then calls the label API and triggers browser print on the PDF.

import { useState } from 'react';
import { Loader2, Package, Printer, AlertCircle } from 'lucide-react';
import { AdminOrder } from '@/lib/orders/types';

interface PackagePreset {
  name: string;
  weightLb: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  description: string;
}

// ── Default presets (hardcoded until package_presets table is built) ──
// These will be replaced by a Supabase fetch in a future task.
const DEFAULT_PRESETS: PackagePreset[] = [
  {
    name: 'Poly Mailer — Small',
    description: 'T-shirts, cardigans, soft items',
    weightLb: 0.5,
    lengthIn: 10,
    widthIn: 13,
    heightIn: 1,
  },
  {
    name: 'Poly Mailer — Large',
    description: 'Bulkier clothing, multiple items',
    weightLb: 1.0,
    lengthIn: 14.5,
    widthIn: 19,
    heightIn: 1,
  },
  {
    name: 'Small Box',
    description: 'Accessories, jewelry, small gifts',
    weightLb: 0.75,
    lengthIn: 8,
    widthIn: 6,
    heightIn: 4,
  },
  {
    name: 'Medium Box',
    description: 'Boots, shoes',
    weightLb: 3.0,
    lengthIn: 14,
    widthIn: 10,
    heightIn: 6,
  },
];

interface PackagePickerProps {
  order: AdminOrder;
  onSuccess: (trackingNumber: string, trackingUrl: string) => void;
  onClose: () => void;
}

export function PackagePicker({ order, onSuccess, onClose }: PackagePickerProps) {
  const [selected, setSelected] = useState<PackagePreset | null>(null);
  const [custom, setCustom] = useState(false);
  const [customFields, setCustomFields] = useState({
    weightLb: '',
    lengthIn: '',
    widthIn: '',
    heightIn: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePreset: PackagePreset | null = custom
    ? {
        name: 'Custom',
        description: 'Manually entered dimensions',
        weightLb: parseFloat(customFields.weightLb) || 0,
        lengthIn: parseFloat(customFields.lengthIn) || 0,
        widthIn: parseFloat(customFields.widthIn) || 0,
        heightIn: parseFloat(customFields.heightIn) || 0,
      }
    : selected;

  const canSubmit =
    activePreset &&
    activePreset.weightLb > 0 &&
    activePreset.lengthIn > 0 &&
    activePreset.widthIn > 0 &&
    activePreset.heightIn > 0;

  async function handleGenerateLabel() {
    if (!activePreset) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${order.id}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weightLb: activePreset.weightLb,
          lengthIn: activePreset.lengthIn,
          widthIn: activePreset.widthIn,
          heightIn: activePreset.heightIn,
          presetName: activePreset.name,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Label generation failed (${res.status})`);
      }

      // Extract tracking info from response headers
      const trackingNumber = res.headers.get('X-Tracking-Number') ?? '';
      const trackingUrl = res.headers.get('X-Tracking-URL') ?? '';
      const postage = res.headers.get('X-Postage') ?? '';

      // Get PDF blob and open print dialog
      const blob = await res.blob();
      const pdfUrl = URL.createObjectURL(blob);

      // Open PDF in new tab so browser print dialog fires
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
      }

      // Notify parent with tracking info
      onSuccess(trackingNumber, trackingUrl);

    } catch (err: any) {
      setError(err.message ?? 'Something went wrong generating the label');
    } finally {
      setLoading(false);
    }
  }

  const addr = order.shipping_address;
  const customerName = [
    addr?.firstName ?? order.customer_first_name,
    addr?.lastName ?? order.customer_last_name,
  ].filter(Boolean).join(' ') || order.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Package className="w-5 h-5" />
              Generate Shipping Label
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Order #{order.order_number} → {customerName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Ship to summary */}
        <div className="px-6 py-3 bg-muted/30 text-sm border-b">
          <span className="text-muted-foreground">Ship to: </span>
          <span className="font-medium">
            {[addr?.address1, addr?.city, addr?.state, addr?.zip]
              .filter(Boolean).join(', ')}
          </span>
          {order.shipping_method_name && (
            <span className="ml-2 text-muted-foreground">
              via {order.shipping_method_name}
            </span>
          )}
        </div>

        {/* Package presets */}
        <div className="px-6 py-4 space-y-3 max-h-72 overflow-y-auto">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Select Package
          </p>

          {DEFAULT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              onClick={() => { setSelected(preset); setCustom(false); }}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                !custom && selected?.name === preset.name
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-sm">{preset.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{preset.description}</div>
                </div>
                <div className="text-xs text-muted-foreground font-mono text-right shrink-0 ml-4">
                  <div>{preset.lengthIn}×{preset.widthIn}×{preset.heightIn}"</div>
                  <div>{preset.weightLb} lb</div>
                </div>
              </div>
            </button>
          ))}

          {/* Custom dimensions */}
          <button
            onClick={() => { setCustom(true); setSelected(null); }}
            className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
              custom
                ? 'border-primary bg-primary/5'
                : 'border-dashed border-border hover:bg-muted/50'
            }`}
          >
            <div className="font-medium text-sm">Custom Dimensions</div>
            <div className="text-xs text-muted-foreground mt-0.5">Enter weight and size manually</div>
          </button>

          {custom && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              {[
                { key: 'weightLb', label: 'Weight (lb)' },
                { key: 'lengthIn', label: 'Length (in)' },
                { key: 'widthIn',  label: 'Width (in)' },
                { key: 'heightIn', label: 'Height (in)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={customFields[key as keyof typeof customFields]}
                    onChange={(e) =>
                      setCustomFields((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    className="w-full border rounded px-3 py-1.5 text-sm bg-background"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 flex items-start gap-2 text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-lg border border-destructive/20">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateLabel}
            disabled={!canSubmit || loading}
            className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                Generate &amp; Print Label
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}