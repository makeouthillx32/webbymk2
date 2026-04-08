/**
 * Central image helpers for Supabase Storage.
 *
 * Your DB stores:
 * - bucket_name
 * - object_path
 *
 * We build public:
 *   {base}/storage/v1/object/public/{bucket_name}/{object_path}
 *
 * IMPORTANT (Next/Image):
 * - If you are using <Image />, pass it the *public URL* returned by this file.
 * - DO NOT pass "/_next/image?url=..." into <Image src>. Let Next optimize automatically.
 *
 * Base priority:
 * 1) NEXT_PUBLIC_SUPABASE_URL (classic project URL)
 * 2) SUPABASE_S3_ENDPOINT (derive base by removing /storage/v1/s3)
 */

export type DbImage = {
  bucket_name: string | null;
  object_path: string | null;
  alt_text?: string | null;
  sort_order?: number | null;
  position?: number | null;
  is_primary?: boolean | null;
  is_public?: boolean | null;
};

function deriveStorageBaseFromS3Endpoint(s3?: string | null) {
  if (!s3) return "";
  // example: https://xxxx.storage.supabase.co/storage/v1/s3
  return s3.replace(/\/storage\/v1\/s3\/?$/, "");
}

function stripTrailingSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

function encodeObjectPath(path: string) {
  // Encode each segment but keep "/" separators
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ??
  "";

const S3_BASE = deriveStorageBaseFromS3Endpoint(
  // client-safe first, then server-only fallback
  process.env.NEXT_PUBLIC_SUPABASE_S3_ENDPOINT ??
    process.env.SUPABASE_S3_ENDPOINT ??
    ""
);

// Keep classic behavior: prefer NEXT_PUBLIC_SUPABASE_URL if set
const STORAGE_BASE = stripTrailingSlashes(SUPABASE_URL || S3_BASE || "");

if (!STORAGE_BASE) {
  console.warn("⚠️ No Supabase base URL found. Set NEXT_PUBLIC_SUPABASE_URL (recommended).");
}

/** Build a public URL for a DB image row (bucket/object assumed public). */
export function supabasePublicUrlFromImage(img?: DbImage | null): string | null {
  if (!img?.bucket_name || !img?.object_path) return null;
  if (!STORAGE_BASE) return null;

  const bucket = img.bucket_name.replace(/^\/+|\/+$/g, "");
  const objectPath = img.object_path.replace(/^\/+/, "");
  const encodedObjectPath = encodeObjectPath(objectPath);

  return `${STORAGE_BASE}/storage/v1/object/public/${bucket}/${encodedObjectPath}`;
}

/**
 * Choose the primary image:
 * - prefer is_primary=true
 * - else lowest sort_order
 * - else lowest position
 */
export function pickPrimaryImage(images?: DbImage[] | null): DbImage | null {
  if (!images?.length) return null;

  const publicOnly = images.filter((i) => i && (i.is_public ?? true));
  const arr = publicOnly.length ? publicOnly : images;

  const primary = arr.find((i) => i?.is_primary);
  if (primary) return primary;

  const bySort = [...arr].sort((a, b) => {
    const as = a?.sort_order ?? 999999;
    const bs = b?.sort_order ?? 999999;
    if (as !== bs) return as - bs;

    const ap = a?.position ?? 999999;
    const bp = b?.position ?? 999999;
    return ap - bp;
  });

  return bySort[0] ?? null;
}

/**
 * Returns the *public* image URL for the primary image.
 *
 * NOTE:
 * - Use this URL directly in <Image src={...} /> or <img src={...} />.
 * - Next.js will optimize automatically when you use <Image />.
 */
export function getPrimaryImageUrl(images?: DbImage[] | null): string | null {
  const img = pickPrimaryImage(images);
  const publicUrl = supabasePublicUrlFromImage(img);
  return publicUrl ?? null;
}

/**
 * Generate a Next.js Image Optimization API URL.
 * 
 * USE CASE:
 * - When you need to use <img> tags (not Next.js <Image />)
 * - When you want manual control over image optimization params
 * 
 * IMPORTANT:
 * - If using Next.js <Image /> component, pass the public URL directly
 * - The <Image /> component handles optimization automatically
 * - Only use this for plain <img> tags where you need Next optimization
 *
 * @param url - The source image URL (must be from an allowed domain in next.config.js)
 * @param options - Optimization options
 * @returns URL to Next.js image optimization endpoint
 */
export function toNextOptimizedImageUrl(
  url: string,
  options?: { width?: number; quality?: number }
): string {
  const { width = 800, quality = 75 } = options ?? {};
  
  const params = new URLSearchParams({
    url: url,
    w: width.toString(),
    q: quality.toString(),
  });
  
  return `/_next/image?${params.toString()}`;
}

/**
 * Constant for the product images bucket name.
 * Used across the app for consistent bucket reference.
 */
export const PRODUCT_IMAGE_BUCKET = "product-images";