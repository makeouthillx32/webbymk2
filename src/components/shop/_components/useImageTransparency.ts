"use client";

import { useState, useEffect } from "react";

/**
 * Client-side React hook to detect if an image has transparency (alpha channel cutouts).
 * Uses fast-path extension/bucket heuristics, followed by offscreen canvas alpha sampling.
 */
export function useImageTransparency(imageUrl: string | null | undefined): boolean | null {
  const [isTransparent, setIsTransparent] = useState<boolean | null>(() => {
    if (!imageUrl) return false;
    const cleanUrl = imageUrl.toLowerCase().split("?")[0];
    // PNG, WebP, SVG are primary candidates for cutout images
    if (cleanUrl.endsWith(".png") || cleanUrl.endsWith(".webp") || cleanUrl.endsWith(".svg")) {
      return true;
    }
    if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) {
      return false;
    }
    return null;
  });

  useEffect(() => {
    if (!imageUrl) {
      setIsTransparent(false);
      return;
    }

    const cleanUrl = imageUrl.toLowerCase().split("?")[0];
    const extensionCandidate =
      cleanUrl.endsWith(".png") || cleanUrl.endsWith(".webp") || cleanUrl.endsWith(".svg");

    if (cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg")) {
      setIsTransparent(false);
      return;
    }

    let active = true;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    // Avoid duplicate full-resolution fetches; sample on a tiny 64px thumbnail
    const sampleUrl = imageUrl.includes("/storage/v1/render/image/")
      ? imageUrl.replace(/width=\d+/, "width=64").replace(/quality=\d+/, "quality=20")
      : imageUrl;
    img.src = sampleUrl;

    img.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setIsTransparent(extensionCandidate);
          return;
        }

        canvas.width = 64;
        canvas.height = 64;
        ctx.drawImage(img, 0, 0, 64, 64);
        const data = ctx.getImageData(0, 0, 64, 64).data;
        let hasAlpha = false;

        // Check alpha channel (4th byte of RGBA) for pixels with transparency
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 245) {
            hasAlpha = true;
            break;
          }
        }
        setIsTransparent(hasAlpha);
      } catch (err) {
        // In case CORS blocks canvas reading, fallback to extension heuristic
        setIsTransparent(extensionCandidate);
      }
    };

    img.onerror = () => {
      if (active) {
        setIsTransparent(extensionCandidate);
      }
    };

    return () => {
      active = false;
    };
  }, [imageUrl]);

  return isTransparent;
}
