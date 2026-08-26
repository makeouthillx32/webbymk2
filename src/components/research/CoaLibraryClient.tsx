"use client";

// Site-wide COA / batch library — product dropdown + free-text batch/lot
// search over every lab report on file, grouped by product. Modeled after
// the competitor UX the user pointed at (ionpeptide.com/lab-results/): pick
// a product OR type a batch number, see matching certificates, click through
// to the full per-product library (/verify/product/<slug>?batch=<code>)
// which already handles highlight/scroll for that exact batch.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShieldCheck, Clock, FlaskConical } from "lucide-react";

export type LibraryReport = {
  id: string;
  access_code: string | null;
  lot_number: string | null;
  coa_number: string | null;
  verified: boolean;
  pending: boolean;
  product_label: string | null;
  test_type: string | null;
  date_confirmed: string | null;
  pdf_url: string | null;
};

export type LibraryProduct = {
  id: string;
  slug: string;
  title: string;
  dosage_label: string | null;
  reports: LibraryReport[];
};

function batchLabel(r: LibraryReport): string {
  return r.lot_number || r.access_code || r.coa_number || "Batch";
}

export default function CoaLibraryClient({ products }: { products: LibraryProduct[] }) {
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return products
      .filter((p) => productId === "all" || p.id === productId)
      .map((p) => {
        if (!q) return p;
        const reports = p.reports.filter((r) =>
          [r.access_code, r.lot_number, r.coa_number, p.title]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(q)),
        );
        return { ...p, reports };
      })
      .filter((p) => p.reports.length > 0);
  }, [products, query, productId]);

  const totalReports = products.reduce((sum, p) => sum + p.reports.length, 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 sticky top-0 z-10 bg-[hsl(var(--background))] py-4 -mt-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by batch, lot, or COA number…"
            className="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-2.5 pl-9 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
          />
        </div>

        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-2.5 px-3 text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))] sm:w-64"
        >
          <option value="all">All products ({products.length})</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} ({p.reports.length})
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))] mb-6">
        {totalReports} certificates on file across {products.length} products.
      </p>

      {filtered.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted-foreground))] py-12 text-center">
          No batches match “{query}”.
        </p>
      ) : (
        <div className="space-y-8">
          {filtered.map((p) => (
            <div key={p.id} className="border-b border-[hsl(var(--border))] pb-8 last:border-0">
              <div className="flex items-center gap-2 mb-3">
                <FlaskConical size={16} className="text-[hsl(var(--primary))]" />
                <Link
                  href={`/${p.slug}`}
                  className="font-bold text-[hsl(var(--foreground))] hover:text-[hsl(var(--primary))]"
                >
                  {p.title}
                </Link>
                {p.dosage_label && (
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {p.dosage_label}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {p.reports.map((r) => (
                  <Link
                    key={r.id}
                    href={
                      r.access_code
                        ? `/verify/product/${p.slug}?batch=${r.access_code}`
                        : `/verify/product/${p.slug}`
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]"
                  >
                    {r.pending ? (
                      <Clock size={11} className="text-amber-500" />
                    ) : r.verified ? (
                      <ShieldCheck size={11} className="text-emerald-500" />
                    ) : null}
                    {batchLabel(r)}
                    {r.date_confirmed && (
                      <span className="text-[hsl(var(--muted-foreground))] font-normal">
                        · {r.date_confirmed}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
