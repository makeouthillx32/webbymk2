"use client";

// Renders the full, unfiltered COA/batch list for a product and — if a
// ?batch=<access_code> query param is present (the normal case when a QR
// code linked here) — scrolls to and highlights that specific entry on
// load, so a scan lands on full transparency but still surfaces "here's
// your vial's exact batch" without hiding everything else.

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CoaCard, type LabReport } from "./CoaCard";

export default function LabLibraryClient({ reports }: { reports: LabReport[] }) {
  const searchParams = useSearchParams();
  const batch = searchParams.get("batch");
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (batch && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (reports.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No lab results have been posted for this product yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((r) => {
        const isMatch = !!batch && r.access_code === batch;
        return (
          <div
            key={r.id}
            ref={isMatch ? highlightRef : undefined}
            className={
              isMatch
                ? "rounded-lg ring-2 ring-[var(--sidebar-primary)] ring-offset-2 ring-offset-[var(--background)]"
                : undefined
            }
          >
            {isMatch && (
              <p className="text-xs font-semibold text-[var(--sidebar-primary)] mb-1">
                ↳ This is the batch your vial's QR code points to
              </p>
            )}
            <CoaCard report={r} />
          </div>
        );
      })}
    </div>
  );
}
