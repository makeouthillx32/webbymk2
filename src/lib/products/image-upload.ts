// lib/products/image-upload.ts

export type NormalizedImageUpload = {
  file: File;
  object_path: string;     // products/<productId>/1.jpg
  sort_order: number;      // 1-based
  position: number;        // 0-based
  is_primary: boolean;
  mime_type: string;
  size_bytes: number;
};

const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function safeExt(file: File) {
  const fromMime = mimeToExt[file.type?.toLowerCase()];
  if (fromMime) return fromMime;

  // fallback: try to read from original filename
  const i = file.name.lastIndexOf(".");
  const raw = i >= 0 ? file.name.slice(i + 1).toLowerCase() : "";
  if (raw) return raw;

  // final fallback
  return "jpg";
}

/**
 * Standardizes naming:
 * - ignores original filename
 * - outputs 1.<ext>, 2.<ext>... based on current order
 * - stores under products/<productId>/
 */
export function normalizeProductImageUploads(
  productId: string,
  files: File[],
  opts?: { startAt?: number } // startAt=1 means first becomes 1.jpg
): NormalizedImageUpload[] {
  const startAt = opts?.startAt ?? 1;

  return files.map((file, idx) => {
    const ext = safeExt(file);
    const n = startAt + idx; // 1,2,3...
    const object_path = `products/${productId}/${n}.${ext}`;

    return {
      file,
      object_path,
      sort_order: n,
      position: n - 1,
      is_primary: n === 1,
      mime_type: file.type || "image/*",
      size_bytes: file.size,
    };
  });
}
