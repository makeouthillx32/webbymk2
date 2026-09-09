"use client";

import Image from "next/image";
import { useImageTransparency } from "./useImageTransparency";

type SmartProductImageProps = {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  className?: string;
  containerClassName?: string;
};

/**
 * Smart product image wrapper that automatically detects transparency.
 * If the image is transparent (PNG/WebP/SVG cutout), it floats over the card
 * background with natural drop shadows.
 * If opaque (lifestyle/apparel photo), it cleanly fills the container with
 * edge-to-edge framing (object-cover) avoiding mismatched borders and awkward padding.
 */
export function SmartProductImage({
  src,
  alt,
  sizes = "(max-width: 768px) 50vw, 25vw",
  fill = true,
  priority = false,
  unoptimized,
  className = "",
  containerClassName = "",
}: SmartProductImageProps) {
  const isTransparent = useImageTransparency(src);

  if (!src) {
    return (
      <div className={`relative aspect-square w-full rounded-xl flex items-center justify-center bg-muted/30 ${containerClassName}`}>
        <div className="text-xs text-muted-foreground px-3 py-1 rounded-md border border-border/50 bg-background/50">
          No image
        </div>
      </div>
    );
  }

  const isCutout = isTransparent !== false; // treat true or pending cutout format as transparent

  // If the image is already edge-transformed via Supabase Storage or is an AVIF
  // with specialized rICC profiles that trigger sharp color corruption, bypass redundant
  // Next.js double-optimization by setting unoptimized={true}.
  const shouldBypassNextOptimization =
    unoptimized ??
    (typeof src === "string" &&
      (src.includes("/storage/v1/render/image/") || src.toLowerCase().includes(".avif")));

  return (
    <div
      className={`relative aspect-square w-full overflow-hidden rounded-xl transition-all duration-300 flex items-center justify-center ${
        isCutout
          ? "bg-transparent"
          : "bg-muted/20 border border-border/40"
      } ${containerClassName}`}
    >
      <Image
        src={src}
        alt={alt}
        fill={fill}
        priority={priority}
        sizes={sizes}
        unoptimized={shouldBypassNextOptimization}
        className={`transition-all duration-500 ease-out ${
          isCutout
            ? "object-contain p-2 scale-100 drop-shadow-[0_6px_16px_rgba(0,0,0,0.25)] group-hover:scale-105 group-hover:drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
            : "object-cover group-hover:scale-105"
        } ${className}`}
      />
    </div>
  );
}
