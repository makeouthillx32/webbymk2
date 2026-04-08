// Shared utility functions used by both create and manage flows
// Location: app/dashboard/[id]/settings/products/_components/shared-utils.ts

// Money conversion utilities
export function centsToMoney(cents: number, currency: string = "USD") {
  const amt = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amt);
  } catch {
    return `$${amt.toFixed(2)}`;
  }
}

export function moneyToCents(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

// Slug generation
export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Safe JSON parsing
export async function safeReadJson(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "NON_JSON_RESPONSE", message: text.slice(0, 300) } };
  }
}

// File extension utilities
export function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "jpg";
}

export function safeExtFromFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("jpg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("avif")) return "avif";
  if (type.includes("heic") || type.includes("heif")) return "heic";

  const name = file.name || "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "jpg";
}

// Object path builder for Supabase storage
export function buildObjectPath(productId: string, index1Based: number, ext: string) {
  return `products/${productId}/${index1Based}.${ext}`;
}

// Random ID generators
export function randId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function generateId() {
  return Math.random().toString(36).substring(7);
}

// Image conversion
/**
 * Converts any image File to WebP format using the browser Canvas API.
 * Falls back to the original file if conversion fails or isn't supported.
 * Quality 0.85 gives excellent visual fidelity at ~30-50% smaller size than JPEG/PNG.
 */
export async function convertToWebP(file: File, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    // Already WebP — skip
    if (file.type === "image/webp") {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const converted = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
            type: "image/webp",
            lastModified: Date.now(),
          });
          resolve(converted);
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback: upload original
    };

    img.src = url;
  });
}