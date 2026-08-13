"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { ShieldCheck, FileText, Download, FlaskConical } from "lucide-react";

type ProductImage = {
  id: string;
  bucket_name: string | null;
  object_path: string | null;
  alt_text?: string | null;
  is_primary?: boolean | null;
};

type VariantImageRef = {
  image_id: string;
  position: number | null;
  is_primary: boolean | null;
  image_type: "photo" | "lab_report" | string;
};

type Variant = {
  id: string;
  sku: string | null;
  title: string;
  options: Record<string, any>;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  inventory_quantity: number;
  track_inventory: boolean;
  allow_backorder: boolean;
  images: VariantImageRef[];
};

type ResultRow = {
  section: string;
  analyte: string;
  limit_spec: string | null;
  result: string | null;
  unit: string | null;
  status: string | null;
};

type ConformitySample = {
  sample_label: string;
  purity_pct: number | null;
  net_content_mg: number | null;
  identification: string | null;
  result: string | null;
  is_representative: boolean;
};

type StatRow = {
  metric_name: string;
  mean_value: number | null;
  std_dev: number | null;
  unit: string | null;
};

type LabReport = {
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

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  badge: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  images: ProductImage[];
  variants: Variant[];
  categories: { id: string; name: string; slug: string }[];
  lab_reports: LabReport[];
};

function formatMoney(cents: number | null | undefined, currency: string) {
  if (cents == null) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export default function ResearchProductDetailClient({ product }: { product: Product }) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null,
  );
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product.variants, selectedVariantId],
  );

  const imagesById = useMemo(() => {
    const map = new Map<string, ProductImage>();
    for (const img of product.images) map.set(img.id, img);
    return map;
  }, [product.images]);

  // Photos to show in the main gallery: the selected variant's linked photos
  // if it has any, otherwise fall back to every product photo.
  const photoImages: ProductImage[] = useMemo(() => {
    if (selectedVariant) {
      const linked = selectedVariant.images
        .filter((vi) => vi.image_type !== "lab_report")
        .map((vi) => imagesById.get(vi.image_id))
        .filter((x): x is ProductImage => !!x);
      if (linked.length > 0) return linked;
    }
    return product.images;
  }, [selectedVariant, imagesById, product.images]);

  const labReportImages: ProductImage[] = useMemo(() => {
    if (!selectedVariant) return [];
    return selectedVariant.images
      .filter((vi) => vi.image_type === "lab_report")
      .map((vi) => imagesById.get(vi.image_id))
      .filter((x): x is ProductImage => !!x);
  }, [selectedVariant, imagesById]);

  const activeImage = photoImages.find((i) => i.id === activeImageId) ?? photoImages[0] ?? null;
  const activeImageUrl = activeImage ? supabasePublicUrlFromImage(activeImage) : null;

  const relevantLabReports = useMemo(
    () =>
      product.lab_reports.filter(
        (r) => !r.variant_id || r.variant_id === selectedVariantId,
      ),
    [product.lab_reports, selectedVariantId],
  );

  const displayPrice = selectedVariant?.price_cents ?? product.price_cents;
  const displayCompareAt = selectedVariant?.compare_at_price_cents ?? product.compare_at_price_cents;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ── Gallery ─────────────────────────────────────────────────── */}
        <div>
          {/* Neutral card background behind the main image — transparent
              cutout photos keep their alpha channel all the way through
              (canvas->webp preserves it), they just sit on this card color
              like ordinary product photography would rather than a raw
              checkerboard or the page background bleeding through. */}
          <div className="relative aspect-square rounded-xl border border-[var(--border)] bg-[var(--sidebar)] overflow-hidden">
            {activeImageUrl ? (
              <Image
                src={activeImageUrl}
                alt={activeImage?.alt_text || product.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-contain p-6"
                priority
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                No image
              </div>
            )}
          </div>

          {photoImages.length > 1 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {photoImages.map((img) => {
                const url = supabasePublicUrlFromImage(img);
                if (!url) return null;
                const isActive = img.id === (activeImage?.id ?? photoImages[0]?.id);
                return (
                  <button
                    key={img.id}
                    onClick={() => setActiveImageId(img.id)}
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 bg-[var(--sidebar)] shrink-0 ${
                      isActive ? "border-[var(--sidebar-primary)]" : "border-transparent"
                    }`}
                  >
                    <Image src={url} alt={img.alt_text || ""} fill className="object-contain p-1" />
                  </button>
                );
              })}
            </div>
          )}

          {labReportImages.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                <FileText size={15} /> Lab Report Scans ({labReportImages.length})
              </h3>
              <div className="flex gap-2 flex-wrap">
                {labReportImages.map((img) => {
                  const url = supabasePublicUrlFromImage(img);
                  if (!url) return null;
                  return (
                    <a
                      key={img.id}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border)] bg-white shrink-0"
                      title={img.alt_text || "Lab report"}
                    >
                      <Image src={url} alt={img.alt_text || "Lab report scan"} fill className="object-contain p-1" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Details ─────────────────────────────────────────────────── */}
        <div>
          {product.badge && (
            <span className="inline-block mb-2 text-xs px-2 py-1 rounded-full border border-[var(--border)] bg-[var(--card)]">
              {product.badge}
            </span>
          )}
          <h1 className="text-3xl font-bold">{product.title}</h1>

          <div className="mt-2 text-xl">
            {formatMoney(displayPrice, product.currency)}
            {displayCompareAt ? (
              <span className="ml-2 text-base line-through opacity-60">
                {formatMoney(displayCompareAt, product.currency)}
              </span>
            ) : null}
          </div>

          {product.variants.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">Size</p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVariantId(v.id);
                      setActiveImageId(null);
                    }}
                    className={`px-3 py-1.5 rounded-full border text-sm ${
                      selectedVariantId === v.id
                        ? "border-[var(--sidebar-primary)] text-[var(--sidebar-primary)]"
                        : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {v.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.description && (
            <p className="mt-6 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {product.description}
            </p>
          )}

          <p className="mt-6 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-4">
            For laboratory research use only. Not for human consumption.
          </p>

          {/* ── Certificates of Analysis ──────────────────────────────── */}
          {relevantLabReports.length > 0 && (
            <div className="mt-8 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <FlaskConical size={18} /> Certificate{relevantLabReports.length > 1 ? "s" : ""} of Analysis
              </h2>

              {relevantLabReports.map((r) => (
                <CoaCard key={r.id} report={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function CoaCard({ report }: { report: LabReport }) {
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
