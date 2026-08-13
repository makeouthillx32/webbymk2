"use client";

import Image from "next/image";
import { useImageTransparency } from "./useImageTransparency";

type SmartProductImageProps = {
  src: string | null | undefined;
  alt: string;
  sizes?: string;
  fill?: boolean;
  priority?: boolean;
  className?: string;
  containerClassName?: string;
};

/**
 * Smart product image wrapper that automatically detects transparency.
 * If the image is transparent (PNG/WebP/SVG cutout), it strips hard borders and solid fills,
 * allowing the image to float over the card/page background with natural drop shadows.
 * If opaque, it presents a clean framed card container.
 */
export function SmartProductImage({
  src,
  alt,
  sizes = "(max-width: 768px) 50vw, 25vw",
  fill = true,
  priority = false,
  className = "",
  containerClassName = "",
}: SmartProductImageProps) {
  const isTransparent = useImageTransparency(src);

  if (!src) {
    return (
      <div className={`relative aspect-square flex items-center justify-center bg-transparent ${containerClassName}`}>
        <div className="text-xs text-[var(--muted-foreground)] px-3 py-1 rounded-md border border-[hsl(var(--border))/0.4] bg-transparent">
          No image
        </div>
      </div>
    );
  }

  const isCutout = isTransparent !== false; // treat true or pending cutout format as transparent

  return (
    <div
      className={`relative aspect-square w-full flex items-center justify-center transition-all duration-300 ${
        isCutout ? "bg-transparent overflow-hidden" : "bg-[var(--sidebar)] rounded-lg border border-[var(--border)] p-3"
      } ${containerClassName}`}
    >
      <Image
        src={src}
        alt={alt}
        fill={fill}
        priority={priority}
        sizes={sizes}
        className={`object-contain transition-all duration-300 ${
          isCutout
            ? "scale-105 drop-shadow-[0_8px_20px_rgba(0,0,0,0.35)] group-hover:scale-110 group-hover:drop-shadow-[0_14px_28px_rgba(0,0,0,0.45)]"
            : "group-hover:scale-[1.03]"
        } ${className}`}
      />
    </div>
  );
}
