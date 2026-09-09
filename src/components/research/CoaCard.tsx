"use client";

// Shared Certificate-of-Analysis card — renders one research_lab_reports row
// (with its physical batch, multi-page document assets, and detector readings).
// Used by the product detail page, profile dashboard, and /verify standalone lookup.

import { useState } from "react";
import { ShieldCheck, Download, FileText, CheckCircle2, Copy, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

export type ResultRow = {
  section: string;
  analyte: string;
  limit_spec: string | null;
  result: string | null;
  unit: string | null;
  status: string | null;
};

export type ConformitySample = {
  sample_label: string;
  purity_pct: number | null;
  net_content_mg: number | null;
  identification: string | null;
  result: string | null;
  is_representative: boolean;
};

export type StatRow = {
  metric_name: string;
  mean_value: number | null;
  std_dev: number | null;
  unit: string | null;
};

export type LabReportAsset = {
  id: string;
  asset_type: string;
  page_number: number;
  file_url: string;
  filename?: string | null;
  sha256_checksum?: string | null;
  is_primary?: boolean;
};

export type InstrumentReading = {
  id?: string;
  reading_type: string;
  peak_number: number;
  retention_time_min: number | null;
  area: number | null;
  height: number | null;
  area_pct: number | null;
  chemical_species: string | null;
  signal_to_noise?: number | null;
};

export type LabReport = {
  id: string;
  variant_id: string | null;
  batch_id?: string | null;
  batch?: {
    id: string;
    batch_number: string;
    lot_number?: string | null;
    is_current_shipping?: boolean;
  } | null;
  lab_name: string;
  lab_logo_url: string | null;
  coa_number: string | null;
  access_code: string | null;
  verified: boolean;
  pending: boolean;
  product_label: string | null;
  lot_number: string | null;
  test_type: string | null;
  date_confirmed: string | null;
  pdf_url: string | null;
  paper_image_url?: string | null;
  purity_pct?: number | null;
  verification_url?: string | null;
  sha256_checksum?: string | null;
  fentanyl_free: boolean | null;
  results: ResultRow[];
  conformity_samples: ConformitySample[];
  stats: StatRow[];
  assets?: LabReportAsset[];
  instrument_readings?: InstrumentReading[];
};

export function CoaCard({ report }: { report: LabReport }) {
  const [showScan, setShowScan] = useState(false);

  if (report.pending) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border)] p-4 bg-[hsl(var(--muted)/0.15)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {report.lab_name}
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            Testing in Progress / Pending Release
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1.5">
          This batch&apos;s analytical testing data is currently under laboratory review and will be posted here immediately upon sign-off.
        </p>
      </div>
    );
  }

  const hasStructuredData = report.results.length > 0;
  const isCurrentShipping = report.batch?.is_current_shipping;
  const batchLabel = report.batch?.batch_number || report.lot_number || report.coa_number || "Batch";
  const scanUrl = report.paper_image_url || report.assets?.find((a) => a.asset_type === "page_scan")?.file_url;
  const headlinePurity = report.purity_pct ?? report.conformity_samples?.[0]?.purity_pct;

  const copyChecksum = (hash: string) => {
    navigator.clipboard.writeText(hash);
    toast.success("SHA-256 Checksum copied to clipboard");
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-5 shadow-xs transition-all hover:border-[hsl(var(--primary)/0.4)]">
      {/* Header Row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-[hsl(var(--card-foreground))]">
              Batch #{batchLabel}
            </span>

            {isCurrentShipping && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Shipping Batch
              </span>
            )}

            {headlinePurity != null && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-[hsl(var(--primary)/0.12)] border border-[hsl(var(--primary)/0.3)] text-[hsl(var(--primary))]">
                {headlinePurity}% HPLC Purity
              </span>
            )}

            {report.verified && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                <ShieldCheck size={12} /> Verified Laboratory
              </span>
            )}
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            {[report.lab_name, report.coa_number && `COA #${report.coa_number}`, report.date_confirmed && `Confirmed ${report.date_confirmed}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {scanUrl && (
            <button
              type="button"
              onClick={() => setShowScan(!showScan)}
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border border-[var(--border)] bg-[hsl(var(--background))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
            >
              {showScan ? <EyeOff size={13} /> : <Eye size={13} />}
              {showScan ? "Hide Scan" : "View Paper Scan"}
            </button>
          )}

          {report.pdf_url && (
            <a
              href={report.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-xs hover:opacity-90 transition-opacity"
            >
              <Download size={13} /> Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Cryptographic Provenance Bar */}
      {report.sha256_checksum && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[hsl(var(--muted)/0.4)] px-3 py-1.5 text-[11px] text-[var(--muted-foreground)]">
          <div className="flex items-center gap-1.5 truncate">
            <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
            <span className="font-semibold text-[hsl(var(--card-foreground))] shrink-0">SHA-256 Provenance:</span>
            <span className="font-mono truncate">{report.sha256_checksum}</span>
          </div>
          <button
            type="button"
            onClick={() => copyChecksum(report.sha256_checksum!)}
            className="shrink-0 p-1 hover:text-[hsl(var(--card-foreground))]"
            title="Copy SHA-256 Checksum"
          >
            <Copy size={12} />
          </button>
        </div>
      )}

      {/* Scanned Lab Paper Inline View */}
      {showScan && scanUrl && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-black/90 p-2 shadow-inner transition-all">
          <div className="flex justify-between items-center px-2 py-1 text-xs text-neutral-400">
            <span>Authentic Third-Party Document Scan</span>
            <a href={scanUrl} target="_blank" rel="noreferrer" className="text-[hsl(var(--primary))] hover:underline">
              Open Full Resolution &rarr;
            </a>
          </div>
          <img
            src={scanUrl}
            alt={`Laboratory Certificate Scan for Batch ${batchLabel}`}
            className="w-full h-auto max-h-[500px] object-contain mx-auto rounded-lg mt-1"
          />
        </div>
      )}

      {/* Analyte Results Table */}
      {hasStructuredData && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left bg-[hsl(var(--muted)/0.3)] text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <th className="py-2 px-3 font-medium">Analyte</th>
                <th className="py-2 px-3 font-medium">Specification</th>
                <th className="py-2 px-3 font-medium">Observed Result</th>
                <th className="py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {report.results.map((row, i) => (
                <tr key={i} className="hover:bg-[hsl(var(--muted)/0.1)]">
                  <td className="py-2 px-3 font-medium text-[hsl(var(--card-foreground))]">{row.analyte}</td>
                  <td className="py-2 px-3 text-[var(--muted-foreground)]">{row.limit_spec || "—"}</td>
                  <td className="py-2 px-3 font-mono">
                    {row.result || "—"} {row.unit || ""}
                  </td>
                  <td className="py-2 px-3">
                    {row.status ? (
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          row.status.toUpperCase() === "PASS" || row.status.toUpperCase() === "CONFORMS"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : row.status.toUpperCase() === "FAIL"
                              ? "bg-red-500/10 text-red-600 dark:text-red-400"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)]"
                        }`}
                      >
                        {row.status}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Statistical Summary */}
      {report.stats.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 pt-3 border-t border-[var(--border)]">
          {report.stats.map((s, i) => (
            <div key={i} className="text-xs">
              <p className="text-[var(--muted-foreground)] text-[11px]">{s.metric_name}</p>
              <p className="font-semibold text-[hsl(var(--card-foreground))]">
                {s.mean_value ?? "—"} {s.unit || ""}
                {s.std_dev != null && (
                  <span className="text-[var(--muted-foreground)] font-normal"> ± {s.std_dev}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Verified Detector Peaks Pill */}
      {report.instrument_readings && report.instrument_readings.length > 0 && (
        <div className="mt-3 text-[11px] text-[var(--muted-foreground)] flex items-center gap-1.5">
          <FileText size={12} className="text-[hsl(var(--primary))]" />
          <span>
            {report.instrument_readings.length} HPLC detector channel integration peaks recorded on file.
          </span>
        </div>
      )}

      {!hasStructuredData && !report.pdf_url && !scanUrl && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          Detailed analytical specifications being prepared for this batch release.
        </p>
      )}
    </div>
  );
}
