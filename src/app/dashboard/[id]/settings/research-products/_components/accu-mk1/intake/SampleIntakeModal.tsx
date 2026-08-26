"use client";

import React, { useState } from "react";

export default function SampleIntakeModal() {
  const [open, setOpen] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [compoundName, setCompoundName] = useState("");
  const [vialQuantity, setVialQuantity] = useState(1);
  const [tareWeight, setTareWeight] = useState("");
  const [notes, setNotes] = useState("");

  const [createdSamples, setCreatedSamples] = useState<any[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotNumber || !compoundName) return;

    const newSamples = Array.from({ length: vialQuantity }, (_, i) => ({
      id: `SMP-${Date.now()}-${i + 1}`,
      barcode: `LIMS-${lotNumber.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
      compoundName,
      lotNumber,
      tareWeight: tareWeight ? parseFloat(tareWeight) : 12.45,
      status: "Logged & In Store",
      createdAt: new Date().toLocaleTimeString(),
    }));

    setCreatedSamples((prev) => [...newSamples, ...prev]);
    setLotNumber("");
    setCompoundName("");
    setVialQuantity(1);
    setTareWeight("");
    setNotes("");
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
        <div>
          <h3 className="text-base font-bold text-foreground">Sample Intake & Barcode Logging</h3>
          <p className="text-xs text-muted-foreground">
            Log incoming raw peptide shipments, record vial tare weights, and print barcodes.
          </p>
        </div>

        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          + Log New Sample Shipment
        </button>
      </div>

      {/* Intaked Samples List */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-4">
        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          Recent Intaked Vials ({createdSamples.length})
        </h4>

        {createdSamples.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">
            No new samples intaked in this session.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {createdSamples.map((sample) => (
              <div
                key={sample.id}
                className="bg-muted/30 p-3 rounded-lg border border-border space-y-1 text-xs"
              >
                <div className="flex justify-between font-mono font-bold text-primary">
                  <span>{sample.barcode}</span>
                  <span className="text-[10px] text-muted-foreground">{sample.createdAt}</span>
                </div>
                <div className="font-semibold text-foreground">{sample.compoundName}</div>
                <div className="text-muted-foreground">Lot: {sample.lotNumber}</div>
                <div className="text-muted-foreground">Tare Weight: {sample.tareWeight} mg</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Intake Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background max-w-lg w-full rounded-2xl border border-border p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h4 className="text-base font-bold text-foreground">Log Sample Shipment</h4>
              <button onClick={() => setOpen(false)} className="text-muted-foreground font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Compound Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tirzepatide Research Grade"
                  value={compoundName}
                  onChange={(e) => setCompoundName(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Lot / Batch Number *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BPC-2026-08"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">
                    Vial Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={vialQuantity}
                    onChange={(e) => setVialQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Vial Tare Weight (mg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="12.45"
                  value={tareWeight}
                  onChange={(e) => setTareWeight(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">
                  Notes
                </label>
                <textarea
                  placeholder="Storage conditions, purity specs..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-input rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90"
                >
                  Generate Barcodes & Intake
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
