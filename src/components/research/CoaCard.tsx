// Shared Certificate-of-Analysis card — renders one research_lab_reports row
// (with its results/conformity_samples/stats children). Used by both the
// product detail page (labs.unenter.live/<slug>) and the standalone
// /verify/<access_code> page reached by scanning a vial-label QR code, so a
// COA can be viewed either in product context or completely standalone.

import { ShieldCheck, Download } from "lucide-react";

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

export type LabReport = {
  id: string;
  variant_id: string | null;
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
  fentanyl_free: boolean | null;
  results: ResultRow[];
  conformity_samples: ConformitySample[];
  stats: StatRow[];
};

export function CoaCard({ report }: { report: LabReport }) {
  if (report.pending) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {report.lab_name}
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            Pending
          </span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          This batch's certificate is being finalized and will be posted here shortly.
        </p>
      </div>
    );
  }

  const hasStructuredData = report.results.length > 0;

  return (
    <div className="rounded-lg border border-[var(--border)] p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {report.lab_name}
          {report.verified && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <ShieldCheck size={11} /> Verified
            </span>
          )}
        </div>
        {report.pdf_url && (
          <a
            href={report.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[var(--sidebar-primary)] hover:opacity-80 flex items-center gap-1"
          >
            <Download size={12} /> Download COA
          </a>
        )}
      </div>

      <p className="text-xs text-[var(--muted-foreground)] mt-1">
        {[report.coa_number, report.lot_number && `Lot ${report.lot_number}`, report.date_confirmed]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {hasStructuredData && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <th className="py-1 pr-2 font-medium">Analyte</th>
                <th className="py-1 pr-2 font-medium">Limit</th>
                <th className="py-1 pr-2 font-medium">Result</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-1 pr-2">{row.analyte}</td>
                  <td className="py-1 pr-2 text-[var(--muted-foreground)]">{row.limit_spec || "—"}</td>
                  <td className="py-1 pr-2">
                    {row.result || "—"} {row.unit || ""}
                  </td>
                  <td className="py-1">
                    {row.status ? (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          row.status === "PASS"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : row.status === "FAIL"
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

      {report.stats.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-4">
          {report.stats.map((s, i) => (
            <div key={i} className="text-xs">
              <p className="text-[var(--muted-foreground)]">{s.metric_name}</p>
              <p className="font-semibold">
                {s.mean_value ?? "—"} {s.unit || ""}
                {s.std_dev != null && (
                  <span className="text-[var(--muted-foreground)] font-normal"> ± {s.std_dev}</span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {!hasStructuredData && !report.pdf_url && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          Detailed results not yet entered for this batch.
        </p>
      )}
    </div>
  );
}
