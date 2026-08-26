"use client";

import React, { useState } from "react";

export interface BatchItem {
  id: string;
  batchNumber: string;
  compoundName: string;
  sampleCount: number;
  purityAverage: number;
  status: "In Progress" | "Completed" | "Pending Approval" | "Flagged";
  slaHoursRemaining: number;
  analyst: string;
  createdAt: string;
}

const MOCK_BATCHES: BatchItem[] = [
  {
    id: "BAT-2026-0801",
    batchNumber: "BPC157-AUG-01",
    compoundName: "BPC-157 (Body Protection Compound 157)",
    sampleCount: 12,
    purityAverage: 99.35,
    status: "Pending Approval",
    slaHoursRemaining: 4,
    analyst: "Dr. Alex Vance",
    createdAt: "2026-08-01T08:00:00Z",
  },
  {
    id: "BAT-2026-0802",
    batchNumber: "GLP1-AUG-01",
    compoundName: "Semaglutide / GLP-1 Research Standard",
    sampleCount: 8,
    purityAverage: 99.80,
    status: "In Progress",
    slaHoursRemaining: 18,
    analyst: "Elena Rostova",
    createdAt: "2026-08-01T09:30:00Z",
  },
  {
    id: "BAT-2026-0803",
    batchNumber: "TIRZ-AUG-01",
    compoundName: "Tirzepatide Dual Agonist Standard",
    sampleCount: 15,
    purityAverage: 98.90,
    status: "Completed",
    slaHoursRemaining: 0,
    analyst: "Marcus Thorne",
    createdAt: "2026-07-31T14:20:00Z",
  },
];

export default function BatchReview() {
  const [batches, setBatches] = useState<BatchItem[]>(MOCK_BATCHES);

  const handleApproveBatch = (batchId: string) => {
    setBatches((prev) =>
      prev.map((b) => (b.id === batchId ? { ...b, status: "Completed" } : b))
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border">
        <div>
          <h3 className="text-base font-bold text-foreground">Lab Batch Review & SLA Tracker</h3>
          <p className="text-xs text-muted-foreground">
            Manage multi-sample testing runs, SLA turnaround windows, and final quality control sign-offs.
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs font-semibold text-muted-foreground uppercase block">
            Active Batches
          </span>
          <span className="text-lg font-black text-primary">{batches.length}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50 border-b border-border font-semibold text-muted-foreground">
            <tr>
              <th className="p-3.5">Batch #</th>
              <th className="p-3.5">Compound</th>
              <th className="p-3.5">Samples</th>
              <th className="p-3.5">Avg Purity</th>
              <th className="p-3.5">SLA Window</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5 text-right">QC Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-muted/30 transition-colors">
                <td className="p-3.5 font-mono font-bold text-foreground">{batch.batchNumber}</td>
                <td className="p-3.5 font-medium text-foreground">{batch.compoundName}</td>
                <td className="p-3.5 text-muted-foreground">{batch.sampleCount} vials</td>
                <td className="p-3.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  {batch.purityAverage}%
                </td>
                <td className="p-3.5">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                      batch.slaHoursRemaining <= 6
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    }`}
                  >
                    {batch.slaHoursRemaining > 0 ? `${batch.slaHoursRemaining}h remaining` : "SLA Met"}
                  </span>
                </td>
                <td className="p-3.5">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                      batch.status === "Completed"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                        : batch.status === "Pending Approval"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                        : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                    }`}
                  >
                    {batch.status}
                  </span>
                </td>
                <td className="p-3.5 text-right">
                  {batch.status === "Pending Approval" ? (
                    <button
                      onClick={() => handleApproveBatch(batch.id)}
                      className="px-3 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                    >
                      Approve Batch
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Signed Off</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
