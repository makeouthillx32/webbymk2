"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { formatPricePerMg } from "@/lib/pricing";
import { SmartProductImage } from "@/components/shop/_components/SmartProductImage";
import {
  RelatedResearchCard,
  type RelatedResearchCardProduct,
} from "@/components/research/RelatedResearchCard";
import {
  FileText,
  FlaskConical,
  ShoppingCart,
  Download,
  Bell,
  LayoutGrid,
  ShieldCheck,
  ThermometerSnowflake,
  Lock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  Archive,
  Info,
  ExternalLink,
  Sparkles,
  Hash,
  Calendar,
  Award,
} from "lucide-react";
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
import type { ResearchProductSection } from "@/lib/research/queries";
import { MoleculeViewport } from "@/components/research/MoleculeViewport";
import type { MoleculeDrawing } from "@/components/research/molecule-drawio";

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

type Batch = {
  id: string;
  batch_number: string;
  status: string;
  is_current_shipping: boolean;
  manufactured_date?: string | null;
  expiration_date?: string | null;
  remaining_quantity?: number | null;
  created_at?: string | null;
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
  form_factor?: string | null;
  molecule_drawing?: MoleculeDrawing | null;
  images: ProductImage[];
  variants: Variant[];
  categories: { id: string; name: string; slug: string }[];
  batches?: Batch[];
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

function getTrustIcon(iconName?: string) {
  switch (iconName?.toLowerCase()) {
    case "thermometersnowflake":
    case "snowflake":
    case "cold":
      return ThermometerSnowflake;
    case "lock":
    case "shield":
      return Lock;
    case "filetext":
    case "file":
    case "document":
      return FileText;
    case "flaskconical":
    case "flask":
      return FlaskConical;
    case "shieldcheck":
    default:
      return ShieldCheck;
  }
}

const DEFAULT_TRUST_ITEMS = [
  {
    icon: "ShieldCheck",
    title: "Chain-of-Custody Tracking",
    desc: "Every physical lot is documented from synthesis order to fulfillment.",
  },
  {
    icon: "FileText",
    title: "Verifiable Public Records",
    desc: "Digital accession and verification of lab certificates via /verify portal.",
  },
  {
    icon: "Lock",
    title: "Research Compliance Gated",
    desc: "Material release gated strictly for lawful in vitro laboratory investigations.",
  },
  {
    icon: "FlaskConical",
    title: "Lot Identification",
    desc: "Discrete lot identifier assigned to released container units.",
  },
];

export default function ResearchProductDetailClient({
  product,
  related = [],
  sections = [],
}: {
  product: Product;
  related?: RelatedResearchCardProduct[];
  sections?: ResearchProductSection[];
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    product.variants[0]?.id ?? null,
  );
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const { addItem } = useResearchCart();

  // "Notify me when back in stock"
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifyState, setNotifyState] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // FAQ Accordion state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Map incoming sections by section_key for rapid lookups
  const sectionMap = useMemo(() => {
    const map: Record<string, ResearchProductSection> = {};
    for (const s of sections) {
      map[s.section_key] = s;
    }
    return map;
  }, [sections]);

  const selectedVariant = useMemo(
    () => product.variants.find((v) => v.id === selectedVariantId) ?? null,
    [product.variants, selectedVariantId],
  );

  const imagesById = useMemo(() => {
    const map = new Map<string, ProductImage>();
    for (const img of product.images) map.set(img.id, img);
    return map;
  }, [product.images]);

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

  const defaultBatchReport = useMemo(
    () => relevantLabReports.find((r) => r.batch?.is_current_shipping) ?? relevantLabReports[0] ?? null,
    [relevantLabReports],
  );

  const [selectedReportId, setSelectedReportId] = useState<string | "all" | null>(null);

  const activeReport = useMemo(() => {
    if (selectedReportId === "all") return null;
    if (selectedReportId) return relevantLabReports.find((r) => r.id === selectedReportId) ?? defaultBatchReport;
    return defaultBatchReport;
  }, [relevantLabReports, selectedReportId, defaultBatchReport]);

  // Consolidated batches
  const allBatches: Batch[] = useMemo(() => {
    if (product.batches && product.batches.length > 0) return product.batches;
    const fromReports: Batch[] = [];
    const seen = new Set<string>();
    for (const r of product.lab_reports) {
      if (r.batch && !seen.has(r.batch.batch_number)) {
        seen.add(r.batch.batch_number);
        fromReports.push({
          id: r.batch.id,
          batch_number: r.batch.batch_number,
          status: (r.batch as any).status || "active",
          is_current_shipping: r.batch.is_current_shipping ?? false,
          manufactured_date: (r.batch as any).manufactured_date ?? null,
          expiration_date: (r.batch as any).expiration_date ?? null,
          remaining_quantity: null,
          created_at: null,
        });
      }
    }
    return fromReports;
  }, [product.batches, product.lab_reports]);

  const currentBatch = useMemo(
    () => allBatches.find((b) => b.is_current_shipping) ?? allBatches[0] ?? null,
    [allBatches],
  );

  const previousBatches = useMemo(
    () => allBatches.filter((b) => b.id !== currentBatch?.id),
    [allBatches, currentBatch],
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

  // Sourced features from section (no invented fallback claims)
  const features = useMemo(() => {
    const raw = sectionMap.key_features?.content_json?.features;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return null;
  }, [sectionMap.key_features]);

  // Sourced trust items
  const trustItems = useMemo(() => {
    const raw = sectionMap.trust_strip?.content_json?.items;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return DEFAULT_TRUST_ITEMS;
  }, [sectionMap.trust_strip]);

  // Sourced FAQs
  const faqQuestions = useMemo(() => {
    const raw = sectionMap.faq?.content_json?.questions;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return [
      {
        q: "How can I independently confirm the COA for this product?",
        a: "Every unit shipped features an assigned lot identifier on the vial label and laboratory packing slip. You can enter the lot number into our digital verification portal at labs.unenter.live/verify to retrieve the complete HPLC chromatogram, mass spectrometry report, and analytical certificate.",
      },
      {
        q: "What packaging is utilized to protect compound integrity during transit?",
        a: "We utilize certified laboratory packaging presets including insulated cold-chain EPS shippers with refrigerant packs and heavy-wall vial partitions to protect against thermal fluctuations and mechanical vibration.",
      },
      {
        q: "Are analytical standards and certificates updated for new batches?",
        a: "Yes. Each synthesized batch receives fresh third-party laboratory analysis before release. Our public COA library maintains the full chronological archive of all prior and active production lots.",
      },
    ];
  }, [sectionMap.faq]);

  // Storage parameters from content_json
  const storageParams = useMemo(() => {
    const json = sectionMap.handling_storage?.content_json;
    if (!json || typeof json !== "object") return [];
    return Object.entries(json).filter(([k]) => typeof k === "string" && !k.startsWith("_"));
  }, [sectionMap.handling_storage]);

  // Quick storage label for specifications matrix (no unverified fallbacks)
  const storageQuickSpec = useMemo(() => {
    const json = sectionMap.handling_storage?.content_json;
    if (json?.ideal_temp) return json.ideal_temp;
    if (json?.storage_temp) return json.storage_temp;
    return "Not currently documented";
  }, [sectionMap.handling_storage]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-10">
      {/* ── TOP BUY BOX HERO GRID ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* ── Gallery ───────────────────────────────────────────────── */}
        <div>
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

        {/* ── Purchase & Quick Specs ─────────────────────────────────── */}
        <div>
          {product.badge && (
            <span className="inline-block mb-2 text-xs px-2 py-1 rounded-full border border-[var(--border)] bg-[var(--card)]">
              {product.badge}
            </span>
          )}
          <h1 className="text-3xl font-bold tracking-tight">{product.title}</h1>

          <div className="mt-2 text-xl font-bold">
            {formatMoney(displayPrice, product.currency)}
            {displayCompareAt ? (
              <span className="ml-2 text-base line-through opacity-60 font-normal">
                {formatMoney(displayCompareAt, product.currency)}
              </span>
            ) : null}
          </div>

          {(pricePerMg || product.dosage_label) && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {pricePerMg ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))]">
                  {pricePerMg}
                </span>
              ) : null}
              {product.dosage_label ? (
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[hsl(var(--secondary)/0.25)] text-[hsl(var(--secondary-foreground))]">
                  {product.dosage_label}
                </span>
              ) : null}
            </div>
          )}

          {product.variants.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-[var(--muted-foreground)] mb-2">Size / Variant</p>
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
                    className={`px-3.5 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                      selectedVariantId === v.id
                        ? "border-[var(--sidebar-primary)] bg-[hsl(var(--primary)/0.08)] text-[var(--sidebar-primary)]"
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
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[var(--radius)] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
                Notify Me When In Stock
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
            <p className="mt-5 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {product.description}
            </p>
          )}

          <MoleculeViewport
            drawing={product.molecule_drawing}
            label={`${product.title} chemical structure`}
            className="mx-auto mt-6 max-w-xl"
            color="primary"
          />

          {/* ── Active Lot Status Summary Card ────────────────────────── */}
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-1.5">
                <Hash size={13} className="text-[hsl(var(--primary))]" /> Active Physical Lot
              </span>
              {currentBatch || activeReport?.lot_number ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Verified Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[hsl(var(--muted)/0.3)] text-[var(--muted-foreground)]">
                  Pending Allocation
                </span>
              )}
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <div>
                <span className="text-lg font-mono font-bold text-[var(--foreground)]">
                  {currentBatch?.batch_number
                    ? `#${currentBatch.batch_number}`
                    : activeReport?.lot_number
                      ? `#${activeReport.lot_number}`
                      : "No active batch assigned"}
                </span>
                <p className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
                  {currentBatch || activeReport?.lot_number
                    ? "Allocated on fulfillment with authenticated COA verification."
                    : "Lot assignment is not currently documented for this product."}
                </p>
              </div>
              {hasLabReports && (
                <a
                  href="#coa"
                  className="text-xs font-semibold text-[var(--sidebar-primary)] hover:underline whitespace-nowrap"
                >
                  Inspect COA &darr;
                </a>
              )}
            </div>
          </div>

          <p className="mt-5 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] pt-3 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            For laboratory research use only. Strictly not for human or veterinary administration.
          </p>
        </div>
      </div>

      {/* ── SECTION 1: TRUST STRIP ──────────────────────────────────── */}
      <section className="mt-14 border-y border-[var(--border)] bg-[hsl(var(--card)/0.4)] py-6 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-left">
          {trustItems.map((item: any, idx: number) => {
            const IconComp = getTrustIcon(item.icon);
            return (
              <div key={idx} className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] shrink-0 mt-0.5">
                  <IconComp size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--foreground)]">{item.title}</h4>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 2: PRODUCT OVERVIEW ─────────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="overview">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              {sectionMap.overview?.eyebrow || "Compound Monograph"}
            </span>
            <h2 className="text-2xl font-bold tracking-tight mt-1">
              {sectionMap.overview?.title || "Product Overview & Analytical Profile"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.2)]">
              <Sparkles size={13} /> High-Purity Analytical Grade
            </span>
          </div>
        </div>
        <div className="mt-6 text-sm leading-relaxed text-[var(--muted-foreground)] space-y-4">
          {sectionMap.overview?.html_content ? (
            <div
              className="space-y-3"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionMap.overview.html_content) }}
            />
          ) : product.description ? (
            <p>{product.description}</p>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              Product analytical overview not currently documented.
            </p>
          )}
        </div>
      </section>

      {/* ── SECTION 3: KEY FEATURES ─────────────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="features">
        <div className="border-b border-[var(--border)] pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
            {sectionMap.key_features?.eyebrow || "Formulation Attributes"}
          </span>
          <h2 className="text-2xl font-bold tracking-tight mt-1">
            {sectionMap.key_features?.title || "Analytical & Structural Specifications"}
          </h2>
        </div>
        {features && features.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feat: any, idx: number) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-5 flex flex-col justify-between hover:border-[hsl(var(--primary)/0.4)] transition-colors shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
                      SPEC 0{idx + 1}
                    </span>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-sm text-[var(--foreground)]">{feat.title}</h3>
                  <p className="mt-1.5 text-xs text-[var(--muted-foreground)] leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card)/0.4)] p-6 text-center">
            <p className="text-xs text-[var(--muted-foreground)]">
              Analytical and structural specifications are not currently documented for this item.
            </p>
          </div>
        )}
      </section>

      {/* ── SECTION 4: SPECIFICATIONS MATRIX ────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="specifications">
        <div className="border-b border-[var(--border)] pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
            Technical Parameters
          </span>
          <h2 className="text-2xl font-bold tracking-tight mt-1">Chemical & Analytical Specifications</h2>
        </div>
        <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] shadow-sm">
          <dl className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
            <div className="divide-y divide-[var(--border)]">
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Chemical Designation</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">{product.title}</dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">CAS Registry Number</dt>
                <dd className="font-mono font-semibold text-[var(--foreground)] text-right">
                  {product.cas_number || "Not currently documented"}
                </dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Chromatographic Purity</dt>
                <dd className="font-mono font-bold text-emerald-500 text-right">
                  {product.purity_percent
                    ? `≥ ${product.purity_percent}% (HPLC)`
                    : activeReport?.purity_pct
                      ? `${activeReport.purity_pct}% (HPLC)`
                      : "Not currently documented"}
                </dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Form Factor</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">
                  {product.form_factor
                    ? titleCase(product.form_factor)
                    : product.tags && product.tags.length > 0
                      ? product.tags.map(titleCase).join(", ")
                      : "Not currently documented"}
                </dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Dosage / Unit Content</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">
                  {product.dosage_label || "Not currently documented"}
                </dd>
              </div>
            </div>
            <div className="divide-y divide-[var(--border)]">
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Analytical Grade</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">In Vitro Analytical Standard</dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Atmospheric Inerting</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">Not currently documented</dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Primary Container</dt>
                <dd className="font-semibold text-[var(--foreground)] text-right">Not currently documented</dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Recommended Storage</dt>
                <dd className="font-mono font-semibold text-[var(--foreground)] text-right">{storageQuickSpec}</dd>
              </div>
              <div className="flex justify-between px-5 py-3.5 text-sm">
                <dt className="text-[var(--muted-foreground)]">Intended Use</dt>
                <dd className="font-semibold text-amber-500 text-right">Laboratory Research Only (RUO)</dd>
              </div>
            </div>
          </dl>
        </div>
      </section>

      {/* ── SECTION 5: CURRENT ACTIVE BATCH ─────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="current-batch">
        <div className="border-b border-[var(--border)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              Live Lot Tracking
            </span>
            <h2 className="text-2xl font-bold tracking-tight mt-1">Current Active Shipping Batch</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              Now Fulfilling
            </span>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="space-y-2">
              <span className="text-xs text-[var(--muted-foreground)] font-mono uppercase">Assigned Physical Lot</span>
              <div className="flex items-center gap-2">
                <Hash className="text-[hsl(var(--primary))]" size={20} />
                <span className="text-xl font-mono font-black text-[var(--foreground)]">
                  {currentBatch?.batch_number || activeReport?.lot_number || "Not currently documented"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {currentBatch || activeReport?.lot_number
                  ? "Fulfillment items are allocated exclusively from this release."
                  : "Batch allocation is not currently documented for this item."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 border-y md:border-y-0 md:border-x border-[var(--border)] py-4 md:py-0 md:px-6">
              <div>
                <span className="text-[11px] text-[var(--muted-foreground)] uppercase">Synthesis Date</span>
                <p className="text-sm font-semibold font-mono mt-0.5">
                  {currentBatch?.manufactured_date || "Not currently documented"}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[var(--muted-foreground)] uppercase">Retest Date</span>
                <p className="text-sm font-semibold font-mono mt-0.5">
                  {currentBatch?.expiration_date || "Not currently documented"}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[var(--muted-foreground)] uppercase">Lot Purity</span>
                <p className="text-sm font-bold font-mono text-emerald-500 mt-0.5">
                  {activeReport?.purity_pct
                    ? `${activeReport.purity_pct}%`
                    : product.purity_percent
                      ? `${product.purity_percent}%`
                      : "Not currently documented"}
                </p>
              </div>
              <div>
                <span className="text-[11px] text-[var(--muted-foreground)] uppercase">QA Release</span>
                <p className="text-sm font-bold text-[var(--foreground)] mt-0.5 flex items-center gap-1">
                  {currentBatch?.status === "active" || activeReport ? (
                    <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 size={13} /> Verified</span>
                  ) : (
                    "Not currently documented"
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <a
                href="#coa"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-xs font-bold hover:opacity-90 transition-opacity"
              >
                <FlaskConical size={14} /> Inspect Batch COA Below &darr;
              </a>
              <Link
                href={`/verify/product/${product.slug}`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] text-xs font-semibold hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <ExternalLink size={13} /> Access Public COA Library
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 6: PREVIOUS BATCHES ARCHIVE ─────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="batch-archive">
        <div className="border-b border-[var(--border)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              Lot Transparency
            </span>
            <h2 className="text-2xl font-bold tracking-tight mt-1">Batch Synthesis History & Archive</h2>
          </div>
          <span className="text-xs text-[var(--muted-foreground)]">
            {allBatches.length} {allBatches.length === 1 ? "Lot" : "Lots"} on File
          </span>
        </div>

        {previousBatches.length > 0 ? (
          <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--border)] bg-[hsl(var(--card))]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-[hsl(var(--card)/0.8)] font-semibold text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3">Manufactured</th>
                  <th className="px-4 py-3">Expiration / Retest</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Verification Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] font-mono">
                {previousBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-[hsl(var(--accent)/0.4)] transition-colors">
                    <td className="px-4 py-3 font-bold text-[var(--foreground)]">#{b.batch_number}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{b.manufactured_date || "—"}</td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{b.expiration_date || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold bg-[var(--sidebar)] border border-[var(--border)]">
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      <Link
                        href={`/verify/product/${product.slug}`}
                        className="text-[hsl(var(--primary))] hover:underline inline-flex items-center gap-1 font-semibold text-xs"
                      >
                        View Archive &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card)/0.5)] p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-[hsl(var(--primary)/0.1)] text-[hsl(var(--primary))] shrink-0">
              <Archive size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[var(--foreground)]">Batch Archive Record</h4>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                {currentBatch?.batch_number
                  ? `Active inventory is fulfilled from verified production lot #${currentBatch.batch_number}. Prior synthesis lots will be archived here as new lots are released.`
                  : "No prior batch history documented."}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 7: AUTHENTIC COA / TESTING RECORDS ──────────────── */}
      <section id="coa" className="mt-16 scroll-mt-24">
        <div className="border-b border-[var(--border)] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
              Third-Party Analytical Data
            </span>
            <h2 className="text-2xl font-bold tracking-tight mt-1 flex items-center gap-2">
              <FlaskConical size={22} className="text-[hsl(var(--primary))]" />
              Physical Batch COA & Laboratory Reports
            </h2>
          </div>
          <Link
            href={`/verify/product/${product.slug}`}
            className="text-xs font-semibold text-[var(--sidebar-primary)] hover:underline flex items-center gap-1 self-start sm:self-auto"
          >
            Full Analytical Archive &rarr;
          </Link>
        </div>

        {hasLabReports ? (
          <div className="mt-6 space-y-4">
            {/* Multi-Batch Switcher */}
            {relevantLabReports.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {relevantLabReports.map((r) => {
                  const isSelected =
                    (activeReport && activeReport.id === r.id) ||
                    (!activeReport && selectedReportId === r.id);
                  const isShipping = r.batch?.is_current_shipping;
                  const bNum = r.batch?.batch_number || r.lot_number || r.coa_number || "Batch";
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedReportId(r.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
                        isSelected
                          ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                          : "border-[var(--border)] bg-[hsl(var(--card))] text-[var(--muted-foreground)] hover:border-[hsl(var(--primary)/0.4)]"
                      }`}
                    >
                      {isShipping && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      <span>#{bNum}</span>
                      {isShipping && <span className="text-[10px] text-emerald-500 font-bold">(Active)</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedReportId("all")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 ${
                    selectedReportId === "all"
                      ? "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"
                      : "border-[var(--border)] bg-[hsl(var(--card))] text-[var(--muted-foreground)] hover:border-[hsl(var(--primary)/0.4)]"
                  }`}
                >
                  View All Batches
                </button>
              </div>
            )}

            {selectedReportId === "all" ? (
              relevantLabReports.map((r) => <CoaCard key={r.id} report={r} />)
            ) : activeReport ? (
              <CoaCard report={activeReport} />
            ) : null}
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--muted)/0.3)] text-[var(--muted-foreground)] mb-4">
              <FlaskConical size={24} />
            </div>
            <h3 className="text-base font-bold text-[var(--foreground)]">
              No Certificate of Analysis Currently on File
            </h3>
            <p className="mt-2 max-w-lg mx-auto text-xs text-[var(--muted-foreground)] leading-relaxed">
              Analytical testing documentation is not currently documented for this item. Check back for verified third-party laboratory records.
            </p>
            <div className="mt-4">
              <Link
                href="/verify"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[hsl(var(--primary))] hover:underline"
              >
                Search Site-Wide COA Repository &rarr;
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── SECTION 8: HANDLING & STORAGE PROTOCOL ─────────────────── */}
      <section className="mt-16 scroll-mt-24" id="handling">
        <div className="border-b border-[var(--border)] pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
            {sectionMap.handling_storage?.eyebrow || "Preparation Guidance"}
          </span>
          <h2 className="text-2xl font-bold tracking-tight mt-1">
            {sectionMap.handling_storage?.title || "Handling, Storage & Laboratory Preparation"}
          </h2>
        </div>

        {/* Dynamic Parameter Badges */}
        {storageParams.length > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {storageParams.map(([key, val]) => (
              <div
                key={key}
                className="rounded-lg border border-[var(--border)] bg-[hsl(var(--card))] p-3.5 shadow-sm"
              >
                <dt className="text-[10px] uppercase font-bold text-[var(--muted-foreground)] tracking-wider">
                  {titleCase(key)}
                </dt>
                <dd className="text-xs font-semibold text-[var(--foreground)] mt-1 font-mono">
                  {String(val)}
                </dd>
              </div>
            ))}
          </div>
        )}

        {/* Protocol Text */}
        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-6 text-sm leading-relaxed text-[var(--muted-foreground)] shadow-sm">
          {sectionMap.handling_storage?.html_content ? (
            <div
              className="space-y-3"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionMap.handling_storage.html_content) }}
            />
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              Handling and storage specifications are not currently documented for this product. Maintain compound in authorized laboratory storage under appropriate environmental controls.
            </p>
          )}
        </div>
      </section>

      {/* ── SECTION 9: RESEARCH COMPLIANCE ─────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="compliance">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  {sectionMap.compliance?.eyebrow || "Material Designation"}
                </span>
                <h3 className="text-lg font-bold text-[var(--foreground)] mt-0.5">
                  {sectionMap.compliance?.title || "Laboratory Compliance & Regulatory Standard"}
                </h3>
              </div>

              <div className="text-xs text-[var(--muted-foreground)] leading-relaxed space-y-2">
                {sectionMap.compliance?.html_content ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionMap.compliance.html_content) }} />
                ) : (
                  <p>
                    This material is synthesized, purified, and packaged exclusively for{" "}
                    <strong>in vitro scientific research and laboratory experimental use</strong>. It is strictly not intended, licensed, or approved for human consumption, clinical application, veterinary use, or therapeutic administration.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-lg border border-amber-500/20 bg-[hsl(var(--background)/0.5)] p-3">
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Classification</span>
                  <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5">Research Chemical (RUO)</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-[hsl(var(--background)/0.5)] p-3">
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Hygiene Standard</span>
                  <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5">OSHA 1910.1450 Lab Controls</p>
                </div>
                <div className="rounded-lg border border-amber-500/20 bg-[hsl(var(--background)/0.5)] p-3">
                  <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">Prohibition</span>
                  <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5">No Clinical or Food Use</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 10: PRODUCT FAQS ────────────────────────────────── */}
      <section className="mt-16 scroll-mt-24" id="faq">
        <div className="border-b border-[var(--border)] pb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
            {sectionMap.faq?.eyebrow || "Researcher Inquiries"}
          </span>
          <h2 className="text-2xl font-bold tracking-tight mt-1">
            {sectionMap.faq?.title || "Frequently Asked Technical Questions"}
          </h2>
        </div>

        <div className="mt-6 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] overflow-hidden shadow-sm">
          {faqQuestions.map((item: any, idx: number) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={idx}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-[hsl(var(--accent)/0.5)]"
                >
                  <span className="font-semibold text-sm text-[var(--foreground)] pr-4">
                    {item.q}
                  </span>
                  <span className="text-[var(--muted-foreground)] shrink-0">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs text-[var(--muted-foreground)] leading-relaxed bg-[hsl(var(--background)/0.5)]">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── SECTION 11: COMMONLY RESEARCHED WITH ────────────────────── */}
      {related.length > 0 && (
        <section className="mt-16 border-t border-[var(--border)] pt-10" id="related">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
              <LayoutGrid size={20} />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight">
                Commonly Researched With
              </h2>
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                Matched to complement experimental workflows and research assay configurations.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
            {related.map((r) => (
              <RelatedResearchCard key={r.id} product={r} />
            ))}
          </div>
        </section>
      )}

      {/* ── SECTION 12: FINAL RESEARCH-USE NOTICE ───────────────────── */}
      <section className="mt-16 mb-6" id="disclaimer">
        <div className="rounded-xl border border-[var(--border)] bg-[hsl(var(--card))] p-6 text-xs leading-relaxed text-[var(--muted-foreground)] shadow-sm">
          <div className="flex items-start gap-3 mb-2">
            <Info size={16} className="text-[hsl(var(--primary))] shrink-0 mt-0.5" />
            <h4 className="font-bold text-sm text-[var(--foreground)]">
              {sectionMap.final_disclaimer?.title || "Notice of Research-Use Restriction"}
            </h4>
          </div>
          {sectionMap.final_disclaimer?.html_content ? (
            <div
              className="space-y-2 mt-2"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(sectionMap.final_disclaimer.html_content) }}
            />
          ) : (
            <p className="mt-2">
              <strong>NOTICE TO PURCHASER:</strong> By acquiring this compound, purchasing entities verify that all products are procured strictly for in vitro laboratory experimental evaluations conducted by trained research personnel. Purchasing entities warrant full possession of appropriate engineering and personal protective controls. Under no circumstances may this compound be introduced into humans or animals.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
