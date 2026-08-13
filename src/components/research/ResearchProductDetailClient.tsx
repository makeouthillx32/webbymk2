"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { formatPricePerMg } from "@/lib/pricing";
import { SmartProductImage } from "@/components/shop/_components/SmartProductImage";
import {
  RelatedResearchCard,
  type RelatedResearchCardProduct,
} from "@/components/research/RelatedResearchCard";
import { FileText, FlaskConical, ShoppingCart, Download, Bell, LayoutGrid } from "lucide-react";
import toast from "react-hot-toast";
import { CoaCard, type LabReport } from "./CoaCard";
import { useResearchCart } from "@/components/Layouts/overlays/research-cart/research-cart-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

type Product = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  badge: string | null;
  dosage_label?: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  brand?: string | null;
  tags?: string[];
  cas_number?: string | null;
  purity_percent?: number | null;
  research_use_only?: boolean | null;
  coa_url?: string | null;
  images: ProductImage[];
  variants: Variant[];
  categories: { id: string; name: string; slug: string }[];
  lab_reports: LabReport[];
};

function titleCase(value: string) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMoney(cents: number | null | undefined, currency: string) {
  if (cents == null) return null;
  if (cents <= 0) return "Contact for pricing";
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
}

export default function ResearchProductDetailClient({
  product,
  related = [],
}: {
  product: Product;
  related?: RelatedResearchCardProduct[];
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null,
  );
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const { addItem } = useResearchCart();

  // "Notify me when back in stock" — research compounds only. Button opens an
  // overlay with the email field; success closes it and confirms via toast
  // (the same react-hot-toast instance mounted app-wide in LayoutShells).
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyState, setNotifyState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [notifyError, setNotifyError] = useState<string | null>(null);

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

  const primaryCategory = product.categories[0] ?? null;
  const primaryCoaUrl =
    relevantLabReports.find((r) => r.pdf_url)?.pdf_url ?? product.coa_url ?? null;
  const hasLabReports = relevantLabReports.length > 0;

  const displayPrice = selectedVariant?.price_cents ?? product.price_cents;
  const displayCompareAt = selectedVariant?.compare_at_price_cents ?? product.compare_at_price_cents;
  const pricePerMg = formatPricePerMg(displayPrice, product.dosage_label, product.currency);

  const isOutOfStock =
    !!selectedVariant &&
    selectedVariant.track_inventory &&
    !selectedVariant.allow_backorder &&
    selectedVariant.inventory_quantity <= 0;

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await addItem(product.id, selectedVariant?.id ?? null, 1);
    } catch (err) {
      console.error("Failed to add to research cart:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyEmail.trim() || notifyState === "submitting") return;
    setNotifyState("submitting");
    setNotifyError(null);
    try {
      const res = await fetch("/api/research-stock-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          research_product_id: product.id,
          research_variant_id: selectedVariant?.id ?? null,
          email: notifyEmail.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setNotifyState("error");
        setNotifyError(json?.error?.message || "Something went wrong — try again.");
        return;
      }
      setNotifyState("done");
      setNotifyOpen(false);
      setNotifyEmail("");
      toast.success("We'll email you when this is back in stock.");
    } catch {
      setNotifyState("error");
      setNotifyError("Something went wrong — try again.");
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ── Gallery ─────────────────────────────────────────────────── */}
        <div>
          {/* Main Gallery Product Image */}
          <SmartProductImage
            src={activeImageUrl}
            alt={activeImage?.alt_text || product.title}
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />

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

          {(pricePerMg || product.dosage_label) && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {pricePerMg ? (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
                  {pricePerMg}
                </span>
              ) : null}
              {product.dosage_label ? (
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-[hsl(var(--secondary)/0.25)] text-[hsl(var(--secondary-foreground))]">
                  {product.dosage_label}
                </span>
              ) : null}
            </div>
          )}

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
                      setNotifyOpen(false);
                      setNotifyState("idle");
                      setNotifyEmail("");
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

          <div className="mt-6 flex items-stretch gap-2">
            <button
              onClick={handleAddToCart}
              disabled={isAdding || isOutOfStock}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--radius)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingCart size={16} />
              {isOutOfStock ? "Out of Stock" : isAdding ? "Adding…" : "Add to Cart"}
            </button>

            {hasLabReports &&
              (primaryCoaUrl ? (
                <a
                  href={primaryCoaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
                  title="Download Certificate of Analysis"
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Lab Report</span>
                </a>
              ) : (
                <a
                  href="#coa"
                  className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
                  title="View Certificate of Analysis"
                >
                  <FlaskConical size={15} />
                  <span className="hidden sm:inline">Lab Report</span>
                </a>
              ))}
          </div>

          {isOutOfStock && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setNotifyOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] py-3 text-sm font-bold hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors"
              >
                <Bell size={16} />
                Notify Me
              </button>

              <Dialog
                open={notifyOpen}
                onOpenChange={(open) => {
                  setNotifyOpen(open);
                  if (!open) {
                    setNotifyState("idle");
                    setNotifyError(null);
                  }
                }}
              >
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Notify me when back in stock</DialogTitle>
                    <DialogDescription>
                      We'll email you the moment {product.title} is available again.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleNotifySubmit} className="flex flex-col gap-3">
                    <input
                      type="email"
                      required
                      autoFocus
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={notifyState === "submitting"}
                      className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
                    />
                    {notifyState === "error" && notifyError && (
                      <p className="text-xs text-red-500">{notifyError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={notifyState === "submitting"}
                      className="rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {notifyState === "submitting" ? "Sending…" : "Notify me"}
                    </button>
                  </form>
                </DialogContent>
              </Dialog>
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

          {/* ── Product Details ───────────────────────────────────────── */}
          <div className="mt-8 rounded-[var(--radius)] border border-[var(--border)] p-4">
            <h2 className="text-sm font-bold mb-3">Product Details</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">SKU</dt>
                <dd className="font-medium">{selectedVariant?.sku || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Product Name</dt>
                <dd className="font-medium">{product.title}</dd>
              </div>
              {primaryCategory && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">Category</dt>
                  <dd className="font-medium">{primaryCategory.name}</dd>
                </div>
              )}
              {product.brand && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">Brand</dt>
                  <dd className="font-medium">{product.brand}</dd>
                </div>
              )}
              {product.dosage_label && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">Dosage</dt>
                  <dd className="font-medium">{product.dosage_label}</dd>
                </div>
              )}
              {product.cas_number && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">CAS Number</dt>
                  <dd className="font-medium">{product.cas_number}</dd>
                </div>
              )}
              {product.purity_percent != null && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">Purity</dt>
                  <dd className="font-medium">{product.purity_percent}%</dd>
                </div>
              )}
              {product.tags && product.tags.length > 0 && (
                <div>
                  <dt className="text-xs text-[var(--muted-foreground)]">Form</dt>
                  <dd className="font-medium">{product.tags.map(titleCase).join(", ")}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-[var(--muted-foreground)]">Research Use Only</dt>
                <dd className="font-medium">
                  {product.research_use_only === false ? "No" : "Yes"}
                </dd>
              </div>
            </dl>
          </div>

          {/* ── Certificates of Analysis ──────────────────────────────── */}
          {relevantLabReports.length > 0 && (
            <div id="coa" className="mt-8 space-y-4 scroll-mt-24">
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

      {/* ── Commonly Researched With ─────────────────────────────────── */}
      {/* TEMP DEBUG */}
      <p data-debug-related-count={related.length} style={{ display: "none" }}>
        related-count:{related.length}
      </p>
      {related.length > 0 && (
        <div className="mt-16 border-t border-[var(--border)] pt-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
              <LayoutGrid size={20} />
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">
              Commonly Researched With
            </h2>
          </div>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Selected to match this product's preparation workflow and research category.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {related.map((r) => (
              <RelatedResearchCard key={r.id} product={r} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
