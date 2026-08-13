"use client";

import React from "react";
import { PeptideRequestStatusLog } from "./types";

interface StatusTimelineProps {
  history: PeptideRequestStatusLog[];
}

const STATUS_LABELS: Record<string, string> = {
  new: "New Request",
  approved: "Approved",
  ordering_standard: "Ordering Standard",
  sample_prep_created: "Sample Prep Created",
  in_process: "In Process",
  completed: "Completed",
  on_hold: "On Hold",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  new: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300",
  approved: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-300",
  ordering_standard: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200 border-indigo-300",
  sample_prep_created: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200 border-purple-300",
  in_process: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 border-orange-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-200 border-gray-300",
};

export default function StatusTimeline({ history }: StatusTimelineProps) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-gray-500 italic">No status history recorded yet.</p>;
  }

  return (
    <div className="relative border-l-2 border-primary/20 ml-4 pl-6 space-y-6">
      {history.map((log) => {
        const dateStr = new Date(log.created_at).toLocaleString();
        const badgeClass = STATUS_BADGE_CLASSES[log.new_status] || "bg-gray-100 text-gray-800";
        const label = STATUS_LABELS[log.new_status] || log.new_status;

        return (
          <div key={log.id} className="relative group">
            {/* Circle dot on line */}
            <div className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary bg-background group-hover:bg-primary transition-colors" />

            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClass}`}
              >
                {label}
              </span>
              <span className="text-xs text-gray-500">{dateStr}</span>
            </div>

            {log.changed_by && (
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Updated by: <span className="font-medium">{log.changed_by}</span> ({log.source})
              </p>
            )}

            {log.notes && (
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 bg-gray-50 dark:bg-gray-900/50 p-2 rounded border border-gray-200 dark:border-gray-800">
                {log.notes}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
