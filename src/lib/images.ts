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
 * 1) NEXT_PUBLIC_SUPABASE_URL_BROWSER (browser/public URL)
 * 2) SUPABASE_PUBLIC_URL when it is not an internal Docker URL
 * 3) NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PROJECT_URL fallbacks
 * 4) SUPABASE_S3_ENDPOINT (derive base by removing /storage/v1/s3)
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

function isInternalDockerUrl(s?: string | null) {
  if (!s) return false;
  return /^https?:\/\/(?:kong|supabase-kong|localhost|127\.0\.0\.1|host\.docker\.internal)(?::\d+)?(?:\/|$)/i.test(s);
}

function encodeObjectPath(path: string) {
  // Encode each segment but keep "/" separators
  return path
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

const PUBLIC_SUPABASE_CANDIDATE = [
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER,
  process.env.SUPABASE_PUBLIC_URL,
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL,
].find((url) => url && !isInternalDockerUrl(url));

const SUPABASE_URL =
  PUBLIC_SUPABASE_CANDIDATE ??
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ??
  process.env.SUPABASE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "";

const S3_BASE = deriveStorageBaseFromS3Endpoint(
  // client-safe first, then server-only fallback
  process.env.NEXT_PUBLIC_SUPABASE_S3_ENDPOINT ??
    process.env.SUPABASE_S3_ENDPOINT ??
    ""
);

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
 * Build a *transformed* public URL, served by the imgproxy instance already
 * wired into this Supabase stack (`STORAGE_IMGPROXY_URL` in docker-compose).
 *
 * Why this matters: the source objects are print-resolution renders. Measured
 * 2026-08-17 on `research-images` — 927 objects, 2.66 GB total, averaging
 * 2.9 MB each, 912 of them over 1 MB. Serving those originals to browsers is
 * what filled ~840 MB of a phone's Safari storage and, once the per-site
 * quota is exhausted, breaks `localStorage` writes (Supabase persists the
 * auth session there) — which locks the user out until they clear site data.
 *
 * Same object through the render endpoint:
 *   original            4,484,796 bytes
 *   width=600  q75       53,136 bytes   (~84x smaller)
 *   width=1200 q80      150,488 bytes   (~30x smaller)
 *
 * `resize=contain` never upscales, so small sources are left alone.
 */
export function supabaseTransformedUrlFromImage(
  img?: DbImage | null,
  opts?: { width?: number; quality?: number },
): string | null {
  if (!img?.bucket_name || !img?.object_path) return null;
  if (!STORAGE_BASE) return null;

  const bucket = img.bucket_name.replace(/^\/+|\/+$/g, "");
  const objectPath = img.object_path.replace(/^\/+/, "");
  const encodedObjectPath = encodeObjectPath(objectPath);

  const params = new URLSearchParams({
    width: String(opts?.width ?? 1200),
    quality: String(opts?.quality ?? 78),
    resize: "contain",
  });

  return `${STORAGE_BASE}/storage/v1/render/image/public/${bucket}/${encodedObjectPath}?${params.toString()}`;
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
  // Transformed by default. These sources average ~2.9 MB (see
  // supabaseTransformedUrlFromImage) and this is the hot path every product
  // grid and card renders through, so shipping originals here is what
  // actually fills users' device storage. Callers needing the untouched
  // original (downloads, print, OG cards that bypass the transform) should
  // call supabasePublicUrlFromImage directly.
  return supabaseTransformedUrlFromImage(img) ?? supabasePublicUrlFromImage(img) ?? null;
}

/**
 * Pick the best OpenGraph product photo for a research chemical.
 * STRICTLY excludes any image tagged as a lab report / COA scan (image_type === "lab_report" / "lab",
 * or alt_text containing "lab", "coa", "pdf", etc.) so lab test reports are NEVER shown as social preview cards.
 */
export function getResearchProductOgImage(product: {
  images?: DbImage[] | null;
  variants?: { images?: { image_id: string; image_type?: string | null }[] }[] | null;
}): string | null {
  if (!product?.images?.length) return null;

  // Build a set of image IDs that are linked to any variant as a lab_report / lab
  const labReportImageIds = new Set<string>();
  if (product.variants) {
    for (const v of product.variants) {
      for (const vi of v.images ?? []) {
        const type = String(vi.image_type ?? "").toLowerCase();
        if (type === "lab_report" || type === "lab" || type.startsWith("lab") || type === "coa") {
          labReportImageIds.add(vi.image_id);
        }
      }
    }
  }

  // Filter product images to keep ONLY real product photos (exclude lab scans)
  const productPhotosOnly = product.images.filter((img: any) => {
    if (img.id && labReportImageIds.has(img.id)) return false;
    const type = String(img.image_type ?? "").toLowerCase();
    if (type === "lab_report" || type === "lab" || type.startsWith("lab") || type === "coa") return false;
    const alt = String(img.alt_text ?? "").toLowerCase();
    if (alt.includes("lab report") || alt.includes("coa") || alt.includes("lab scan") || alt.includes("(pdf)")) return false;
    return true;
  });

  const chosen = pickPrimaryImage(productPhotosOnly);
  return chosen ? supabasePublicUrlFromImage(chosen) : null;
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

/**
 * Constant for the Unenter Labs research chemical images bucket name.
 */
export const RESEARCH_IMAGE_BUCKET = "research-images";
