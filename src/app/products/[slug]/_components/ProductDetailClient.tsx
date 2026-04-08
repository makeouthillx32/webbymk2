// app/products/[slug]/_components/ProductDetailClient.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  Heart,
  Share2,
  ChevronDown,
  ChevronUp,
  Ruler,
} from "lucide-react";
import { useCart } from "@/components/Layouts/overlays/cart/cart-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductImage {
  id: string;
  object_path: string;
  bucket_name: string;
  alt_text: string;
  position: number;
  is_primary: boolean;
}

interface ProductVariant {
  id: string;
  sku: string;
  title?: string;
  options: Record<string, any>;
  price_cents: number;
  compare_at_price_cents?: number;
  inventory_quantity: number;
  track_inventory: boolean;
  allow_backorder: boolean;
  weight_grams?: number;
  position: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  title: string;
  slug: string;
  description?: string;
  price_cents: number;
  compare_at_price_cents?: number;
  currency: string;
  status: string;
  badge?: string;
  is_featured: boolean;
  brand?: string;
  material?: string;
  made_in?: string;
  images: ProductImage[];
  variants: ProductVariant[];
  categories: Category[];
}

interface ProductDetailClientProps {
  product: Product;
}

// ─── Pure Helpers (defined outside component, no hooks) ───────────────────────

/** Extract display string from a variant option value (string or color object) */
function getOptionDisplayValue(optionValue: any): string {
  if (typeof optionValue === "string") return optionValue;
  if (optionValue && typeof optionValue === "object" && optionValue.name) {
    return optionValue.name;
  }
  return String(optionValue);
}

/** Deep-equal comparison for option values (handles color objects) */
function optionsMatch(value1: any, value2: any): boolean {
  if (typeof value1 === "string" && typeof value2 === "string") {
    return value1 === value2;
  }
  if (value1?.name && value2?.name) {
    return value1.name === value2.name;
  }
  return String(value1) === String(value2);
}

/**
 * Returns true if the image alt text contains "SG" as a standalone tag.
 * Matches: "SG", "SG ", " SG", "[SG]", "(SG)", "SG-", etc.
 * Will NOT match "MSG" or "DESIGN" — only isolated "SG".
 */
function isSizeGuideImage(image: ProductImage): boolean {
  const alt = image.alt_text || "";
  return /\bSG\b/i.test(alt);
}

/**
 * Try to find the first gallery image whose alt text contains the given
 * color/variant name (case-insensitive substring match).
 * Returns the index within the galleryImages array, or -1 if not found.
 */
function findGalleryImageIndexByHint(
  galleryImages: ProductImage[],
  hint: string
): number {
  if (!hint) return -1;
  const lower = hint.toLowerCase();
  return galleryImages.findIndex((img) =>
    (img.alt_text || "").toLowerCase().includes(lower)
  );
}

// ─── Collapsible Accordion ────────────────────────────────────────────────────

function Accordion({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between py-4 text-sm font-medium text-left hover:text-primary transition-colors"
      >
        <span>{title}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProductDetailClient({ product }: ProductDetailClientProps) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, any>>({});
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [sizeGuideImageIndex, setSizeGuideImageIndex] = useState(0);

  const { addItem } = useCart();

  // ── Image URL builder ──────────────────────────────────────────────────────
  const getImageUrl = (image: ProductImage) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/${image.bucket_name}/${image.object_path}`;
  };

  // ── Split images: gallery vs size-guide ───────────────────────────────────
  const { galleryImages, sizeGuideImages } = useMemo(() => {
    const gallery: ProductImage[] = [];
    const guide: ProductImage[] = [];
    for (const img of product.images) {
      if (isSizeGuideImage(img)) {
        guide.push(img);
      } else {
        gallery.push(img);
      }
    }
    return { galleryImages: gallery, sizeGuideImages: guide };
  }, [product.images]);

  // ── Gallery index tracks within galleryImages only ─────────────────────────
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const safeImageIndex = Math.min(selectedImageIndex, Math.max(0, galleryImages.length - 1));

  const previousImage = () => {
    setSelectedImageIndex((prev) =>
      prev === 0 ? galleryImages.length - 1 : prev - 1
    );
  };

  const nextImage = () => {
    setSelectedImageIndex((prev) =>
      prev === galleryImages.length - 1 ? 0 : prev + 1
    );
  };

  // ── Variant / option logic ─────────────────────────────────────────────────
  const hasVariants = product.variants && product.variants.length > 0;

  // Keys that live in variant.options as descriptive metadata, NOT as user-selectable
  // choices. These are surfaced in the Details accordion instead.
  const DESCRIPTOR_OPTION_KEYS = new Set([
    "material",
    "made_in",
    "dimensions",
    "weight",
  ]);

  const optionTypes = useMemo(() => {
    if (!hasVariants) return {};
    const types: Record<string, Set<string>> = {};
    const rawValues: Record<string, any[]> = {};

    product.variants.forEach((variant) => {
      Object.entries(variant.options || {}).forEach(([key, value]) => {
        // Skip descriptor keys — they describe the product, not a variant choice
        if (DESCRIPTOR_OPTION_KEYS.has(key.toLowerCase())) return;

        if (!types[key]) {
          types[key] = new Set();
          rawValues[key] = [];
        }
        const displayValue = getOptionDisplayValue(value);
        if (!types[key].has(displayValue)) {
          types[key].add(displayValue);
          rawValues[key].push(value);
        }
      });
    });

    const result: Record<string, any[]> = {};
    Object.entries(types).forEach(([key]) => {
      result[key] = rawValues[key];
    });
    return result;
  }, [product.variants, hasVariants]);

  const selectedVariant = useMemo(() => {
    if (!hasVariants) return null;
    if (product.variants.length === 1) return product.variants[0];
    if (Object.keys(selectedOptions).length === 0) return product.variants[0];

    return (
      product.variants.find((v) =>
        Object.entries(selectedOptions).every(([optionKey, optionValue]) =>
          optionsMatch(v.options[optionKey], optionValue)
        )
      ) || product.variants[0]
    );
  }, [product.variants, selectedOptions, hasVariants]);

  const displayPrice = selectedVariant?.price_cents ?? product.price_cents;
  const compareAtPrice =
    selectedVariant?.compare_at_price_cents ?? product.compare_at_price_cents;
  const hasDiscount = compareAtPrice && compareAtPrice > displayPrice;
  // A variant is "in stock" if it has qty > 0, OR if backorders are allowed
  // (backorder = always purchasable regardless of qty, e.g. digital / made-to-order)
  const inStock = selectedVariant
    ? selectedVariant.allow_backorder || selectedVariant.inventory_quantity > 0
    : true;

  // ── Color selection → auto-jump gallery image ──────────────────────────────
  const handleOptionSelect = (optionName: string, optionValue: any) => {
    setSelectedOptions((prev) => ({ ...prev, [optionName]: optionValue }));

    // If this is a color option, try to jump to a matching gallery image
    if (optionName.toLowerCase() === "color") {
      const colorHint = getOptionDisplayValue(optionValue);
      const matchIndex = findGalleryImageIndexByHint(galleryImages, colorHint);
      if (matchIndex !== -1) {
        setSelectedImageIndex(matchIndex);
      }
    }
  };

  // ── Add to cart ────────────────────────────────────────────────────────────
  const handleAddToCart = async () => {
    if (!selectedVariant || !inStock) return;
    setIsAddingToCart(true);
    try {
      await addItem(selectedVariant.id, 1);
    } catch (error) {
      console.error("Failed to add to cart:", error);
    } finally {
      setIsAddingToCart(false);
    }
  };

  // ── Option button renderer ─────────────────────────────────────────────────
  const renderOptionButton = (
    optionName: string,
    optionValue: any,
    isSelected: boolean
  ) => {
    const displayValue = getOptionDisplayValue(optionValue);
    const isColor =
      optionName.toLowerCase() === "color" && optionValue?.hex;

    return (
      <button
        key={displayValue}
        onClick={() => handleOptionSelect(optionName, optionValue)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm transition-colors ${
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input hover:border-primary"
        }`}
      >
        {isColor && (
          <span
            className="inline-block w-3.5 h-3.5 rounded-full border border-white/40 shadow-sm"
            style={{ backgroundColor: optionValue.hex }}
          />
        )}
        {displayValue}
      </button>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-8">

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
        <Link href="/" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <span>/</span>
        {product.categories.length > 0 && (
          <>
            <Link
              href={`/${product.categories[0].slug}`}
              className="hover:text-foreground transition-colors capitalize"
            >
              {product.categories[0].name}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">{product.title}</span>
      </nav>

      {/* Main Product Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

        {/* ── LEFT: Image Gallery ─────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Main Image */}
          <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
            {galleryImages.length > 0 ? (
              <>
                <Image
                  src={getImageUrl(galleryImages[safeImageIndex])}
                  alt={galleryImages[safeImageIndex].alt_text || product.title}
                  fill
                  className="object-cover"
                  priority
                />

                {/* Prev / Next */}
                {galleryImages.length > 1 && (
                  <>
                    <button
                      onClick={previousImage}
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors shadow"
                      aria-label="Previous image"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background rounded-full p-2 transition-colors shadow"
                      aria-label="Next image"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}

                {/* Badge */}
                {product.badge && (
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-primary text-primary-foreground">
                      {product.badge}
                    </Badge>
                  </div>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                No image available
              </div>
            )}
          </div>

          {/* Thumbnails (gallery images only — SG excluded) */}
          {galleryImages.length > 1 && (
            <div className="grid grid-cols-6 gap-2">
              {galleryImages.map((image, index) => (
                <button
                  key={image.id}
                  onClick={() => setSelectedImageIndex(index)}
                  className={`aspect-square relative rounded-lg overflow-hidden border-2 transition-colors ${
                    index === safeImageIndex
                      ? "border-primary"
                      : "border-transparent hover:border-muted-foreground"
                  }`}
                >
                  <Image
                    src={getImageUrl(image)}
                    alt={image.alt_text || `${product.title} – view ${index + 1}`}
                    fill
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── RIGHT: Product Info ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          {/* 1 · Title */}
          <div>
            <h1 className="text-3xl font-bold leading-tight">{product.title}</h1>
          </div>

          {/* 2 · Price */}
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold">
              ${(displayPrice / 100).toFixed(2)}
            </span>
            {hasDiscount && compareAtPrice && (
              <span className="text-lg text-muted-foreground line-through">
                ${(compareAtPrice / 100).toFixed(2)}
              </span>
            )}
            {hasDiscount && (
              <Badge variant="destructive" className="text-xs">Sale</Badge>
            )}
          </div>

          {/* 3 · Variant Options (color first, then size, then others) */}
          {hasVariants && Object.keys(optionTypes).length > 0 && (
            <div className="space-y-4">
              {/* Render color first */}
              {Object.entries(optionTypes)
                .sort(([a], [b]) => {
                  const order = ["color", "size"];
                  const ai = order.indexOf(a.toLowerCase());
                  const bi = order.indexOf(b.toLowerCase());
                  if (ai === -1 && bi === -1) return 0;
                  if (ai === -1) return 1;
                  if (bi === -1) return -1;
                  return ai - bi;
                })
                .map(([optionName, optionValues]) => (
                  <div key={optionName}>
                    <label className="block text-sm font-semibold mb-2 capitalize tracking-wide">
                      {optionName}
                      {selectedOptions[optionName] && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          — {getOptionDisplayValue(selectedOptions[optionName])}
                        </span>
                      )}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {optionValues.map((value: any) => {
                        const isSelected = selectedOptions[optionName]
                          ? optionsMatch(selectedOptions[optionName], value)
                          : false;
                        return renderOptionButton(optionName, value, isSelected);
                      })}
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* 4 · Size & Fit dropdown (only if SG images exist) */}
          {sizeGuideImages.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <button
                onClick={() => setSizeGuideOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-primary" />
                  Size &amp; Fit Guide
                </span>
                {sizeGuideOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {sizeGuideOpen && (
                <div className="border-t px-4 py-4 space-y-3 bg-muted/20">
                  {/* Size guide image viewer */}
                  <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-muted">
                    <Image
                      src={getImageUrl(sizeGuideImages[sizeGuideImageIndex])}
                      alt={
                        sizeGuideImages[sizeGuideImageIndex].alt_text ||
                        "Size guide"
                      }
                      fill
                      className="object-contain"
                    />
                  </div>

                  {/* Thumbnails if multiple SG images */}
                  {sizeGuideImages.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {sizeGuideImages.map((img, idx) => (
                        <button
                          key={img.id}
                          onClick={() => setSizeGuideImageIndex(idx)}
                          className={`relative w-14 h-14 rounded border-2 overflow-hidden transition-colors ${
                            idx === sizeGuideImageIndex
                              ? "border-primary"
                              : "border-transparent hover:border-muted-foreground"
                          }`}
                        >
                          <Image
                            src={getImageUrl(img)}
                            alt={img.alt_text || `Size guide ${idx + 1}`}
                            fill
                            className="object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5 · Stock Status */}
          {selectedVariant && (
            <div className="text-sm">
              {inStock ? (
                <span className="text-green-600 font-medium">
                  ✓ In Stock
                  {/* Hide quantity count when backorders are on — qty is irrelevant */}
                  {!selectedVariant.allow_backorder && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({selectedVariant.inventory_quantity} available)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-red-600 font-medium">✗ Out of Stock</span>
              )}
            </div>
          )}

          {/* 6 · Add to Cart */}
          <div className="flex gap-2">
            <Button
              size="lg"
              className="flex-1"
              onClick={handleAddToCart}
              disabled={!inStock || isAddingToCart}
            >
              <ShoppingCart className="w-5 h-5 mr-2" />
              {isAddingToCart ? "Adding…" : "Add to Cart"}
            </Button>
            <Button size="lg" variant="outline" aria-label="Wishlist">
              <Heart className="w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              aria-label="Share"
              onClick={async () => {
                const url = window.location.href;
                if (navigator.share) {
                  try {
                    await navigator.share({
                      title: product.title,
                      url,
                    });
                  } catch {
                    // user cancelled — do nothing
                  }
                } else {
                  // Fallback: copy to clipboard
                  await navigator.clipboard.writeText(url);
                }
              }}
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </div>

          {/* 7 · Collapsible Accordions */}
          <div className="mt-2">

            {/* Description */}
            {product.description && (
              <Accordion title="Description" defaultOpen={true}>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {product.description}
                </p>
              </Accordion>
            )}

            {/* Materials & Details */}
            {(() => {
              // Fallback: pull material/made_in from variant options if not on product level
              const material = product.material || (selectedVariant?.options?.material as string) || null;
              const madeIn = product.made_in || (selectedVariant?.options?.made_in as string) || null;
              if (!material && !madeIn && !product.brand) return null;
              return (
                <Accordion title="Materials &amp; Details">
                  <div className="space-y-2 text-sm">
                    {product.brand && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Brand</span>
                        <span className="font-medium">{product.brand}</span>
                      </div>
                    )}
                    {material && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Material</span>
                        <span className="font-medium">{material}</span>
                      </div>
                    )}
                    {madeIn && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Made In</span>
                        <span className="font-medium">{madeIn}</span>
                      </div>
                    )}
                  </div>
                </Accordion>
              );
            })()}


          </div>
        </div>
      </div>
    </div>
  );
}