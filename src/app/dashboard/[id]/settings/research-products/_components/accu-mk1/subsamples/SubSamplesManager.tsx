"use client";

import React, { useState } from "react";

export interface SubSampleItem {
  id: string;
  vialBarcode: string;
  targetWeightMg: number;
  grossWeightMg: number;
  tareWeightMg: number;
  netWeightMg: number;
  variancePercent: number;
  status: "PASSED" | "FLAGGED";
  timestamp: string;
}

export default function SubSamplesManager() {
  const [samples, setSamples] = useState<SubSampleItem[]>([
    {
      id: "SUB-01",
      vialBarcode: "LIMS-BPC157-001",
      targetWeightMg: 5.0,
      grossWeightMg: 17.48,
      tareWeightMg: 12.45,
      netWeightMg: 5.03,
      variancePercent: 0.6,
      status: "PASSED",
      timestamp: "10:14 AM",
    },
    {
      id: "SUB-02",
      vialBarcode: "LIMS-BPC157-002",
      targetWeightMg: 5.0,
      grossWeightMg: 17.82,
      tareWeightMg: 12.42,
      netWeightMg: 5.4,
      variancePercent: 8.0,
      status: "FLAGGED",
      timestamp: "10:16 AM",
    },
  ]);

  const [barcode, setBarcode] = useState("");
  const [targetWeight, setTargetWeight] = useState("5.0");
  const [grossWeight, setGrossWeight] = useState("");
  const [tareWeight, setTareWeight] = useState("12.45");

  const handleAddMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(targetWeight);
    const gross = parseFloat(grossWeight);
    const tare = parseFloat(tareWeight);

    if (isNaN(gross) || isNaN(tare) || isNaN(target)) return;

    const net = Math.round((gross - tare) * 100) / 100;
    const variance = Math.round((Math.abs(net - target) / target) * 100 * 10) / 10;
    const isPassed = variance <= 5.0; // 5% max allowed variance

    const newSample: SubSampleItem = {
      id: `SUB-${Date.now().toString().slice(-4)}`,
      vialBarcode: barcode.trim() || `LIMS-SMP-${samples.length + 1}`,
      targetWeightMg: target,
      grossWeightMg: gross,
      tareWeightMg: tare,
      netWeightMg: net,
      variancePercent: variance,
      status: isPassed ? "PASSED" : "FLAGGED",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setSamples([newSample, ...samples]);
    setBarcode("");
    setGrossWeight("");
  };

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-2xl border border-border shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Vial Aliquot & Weight Variance QC</h3>
          <p className="text-xs text-muted-foreground">
            Sub-sampling powder weight verifications with automated tare weight subtraction and tolerance checks.
          </p>
        </div>

        <form onSubmit={handleAddMeasurement} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Vial Barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Target mg (e.g. 5.0)"
            value={targetWeight}
            onChange={(e) => setTargetWeight(e.target.value)}
            required
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Tare Weight mg"
            value={tareWeight}
            onChange={(e) => setTareWeight(e.target.value)}
            required
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Gross Weight mg *"
            value={grossWeight}
            onChange={(e) => setGrossWeight(e.target.value)}
            required
            className="px-3 py-2 text-xs rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            + Record Measurement
          </button>
        </form>
      </div>

      {/* Measurement Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
            <tr>
              <th className="p-3.5">Vial Barcode</th>
              <th className="p-3.5">Target (mg)</th>
              <th className="p-3.5">Tare (mg)</th>
              <th className="p-3.5">Gross (mg)</th>
              <th className="p-3.5">Net Powder (mg)</th>
              <th className="p-3.5">Variance (%)</th>
              <th className="p-3.5">QC Status</th>
              <th className="p-3.5 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {samples.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-3.5 font-mono font-bold text-primary">{s.vialBarcode}</td>
                <td className="p-3.5 font-medium">{s.targetWeightMg} mg</td>
                <td className="p-3.5 text-muted-foreground">{s.tareWeightMg} mg</td>
                <td className="p-3.5 text-muted-foreground">{s.grossWeightMg} mg</td>
                <td className="p-3.5 font-bold text-foreground">{s.netWeightMg} mg</td>
                <td
                  className={`p-3.5 font-semibold ${
                    s.variancePercent > 5.0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  ±{s.variancePercent}%
                </td>
                <td className="p-3.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      s.status === "PASSED"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                    }`}
                  >
                    {s.status}
                  </span>
                </td>
                <td className="p-3.5 text-right text-muted-foreground">{s.timestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
