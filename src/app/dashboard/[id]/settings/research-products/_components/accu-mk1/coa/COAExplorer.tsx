"use client";

import React, { useState } from "react";

export interface COARecord {
  id: string;
  batchNumber: string;
  compoundName: string;
  purity: number;
  testedDate: string;
  molecularWeight: number;
  status: "Passed" | "Failed" | "Pending";
  analyst: string;
  chromatographData?: { x: number; y: number }[];
}

const MOCK_COAS: COARecord[] = [
  {
    id: "COA-2026-001",
    batchNumber: "BPC157-20260419-01",
    compoundName: "BPC-157 (Body Protection Compound 157)",
    purity: 99.42,
    testedDate: "2026-04-19",
    molecularWeight: 1419.5,
    status: "Passed",
    analyst: "Dr. Alex Vance",
    chromatographData: Array.from({ length: 50 }, (_, i) => ({
      x: i * 0.2,
      y: i === 25 ? 98.4 : Math.sin(i * 0.3) * 5 + 2,
    })),
  },
  {
    id: "COA-2026-002",
    batchNumber: "TB500-20260421-04",
    compoundName: "TB-500 (Thymosin Beta-4)",
    purity: 98.85,
    testedDate: "2026-04-21",
    molecularWeight: 4963.5,
    status: "Passed",
    analyst: "Elena Rostova",
    chromatographData: Array.from({ length: 50 }, (_, i) => ({
      x: i * 0.2,
      y: i === 30 ? 99.1 : Math.cos(i * 0.2) * 4 + 3,
    })),
  },
];

export default function COAExplorer() {
  const [selectedCoa, setSelectedCoa] = useState<COARecord>(MOCK_COAS[0]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-card p-4 rounded-xl border border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground">Digital Certificate of Analysis (COA)</h2>
          <p className="text-xs text-muted-foreground">HPLC Purity & Mass Spectrometry Reports</p>
        </div>

        <div className="flex gap-2">
          {MOCK_COAS.map((coa) => (
            <button
              key={coa.id}
              onClick={() => setSelectedCoa(coa)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                selectedCoa.id === coa.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-input hover:bg-accent"
              }`}
            >
              {coa.batchNumber}
            </button>
          ))}
        </div>
      </div>

      {/* COA Document Card */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-6">
        <div className="flex justify-between items-start border-b border-border pb-4">
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              {selectedCoa.id}
            </span>
            <h3 className="text-xl font-bold text-foreground mt-1">{selectedCoa.compoundName}</h3>
            <p className="text-xs text-muted-foreground">Batch: {selectedCoa.batchNumber}</p>
          </div>

          <div className="text-right">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                selectedCoa.status === "Passed"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {selectedCoa.status}
            </span>
            <p className="text-xs text-muted-foreground mt-1">Tested: {selectedCoa.testedDate}</p>
          </div>
        </div>

        {/* Purity Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-muted/40 p-4 rounded-xl border border-border text-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              HPLC Purity
            </span>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {selectedCoa.purity}%
            </p>
          </div>

          <div className="bg-muted/40 p-4 rounded-xl border border-border text-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Molecular Weight
            </span>
            <p className="text-2xl font-black text-foreground mt-1">
              {selectedCoa.molecularWeight} g/mol
            </p>
          </div>

          <div className="bg-muted/40 p-4 rounded-xl border border-border text-center">
            <span className="text-xs font-semibold text-muted-foreground uppercase">
              Lead Analyst
            </span>
            <p className="text-base font-bold text-foreground mt-2">{selectedCoa.analyst}</p>
          </div>
        </div>

        {/* Chromatograph Spectrum Chart Mock */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            HPLC Chromatograph Peak Analysis
          </h4>
          <div className="h-48 w-full bg-slate-950 rounded-xl p-4 flex items-end justify-between gap-1 overflow-hidden border border-slate-800">
            {selectedCoa.chromatographData?.map((point, idx) => (
              <div
                key={idx}
                style={{ height: `${Math.max(point.y, 4)}%` }}
                className="w-full bg-emerald-400 rounded-t transition-all hover:bg-emerald-300"
                title={`Time: ${point.x.toFixed(1)} min | Intensity: ${point.y.toFixed(1)}%`}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Retention Time (Minutes) vs Peak Absorption Intensity (%)
          </p>
        </div>
      </div>
    </div>
  );
}
