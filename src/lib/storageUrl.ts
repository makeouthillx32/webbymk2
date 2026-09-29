// src/lib/storageUrl.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public URL for a Supabase Storage object, safe to render in a browser.
//
// There are TWO Supabase URLs in this stack and picking the wrong one fails in
// a way that looks like a broken upload rather than a broken link:
//
//   NEXT_PUBLIC_SUPABASE_URL          → internal Docker address (kong:8000).
//                                       Correct on the server, unreachable
//                                       from any browser.
//   NEXT_PUBLIC_SUPABASE_URL_BROWSER  → the public address.
//
// Hand-building `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/...` in a
// client component therefore produces a URL that resolves to nothing, and the
// symptom is an image that never appears even though the file uploaded fine and
// the row points at it correctly. That mis-derivation had already happened in
// three separate files, so it lives here once now.
//
// Prefer `supabase.storage.from(b).getPublicUrl(p)` where a client is already
// in scope — it reads the same base. This helper exists for the places that
// only have a bucket and a path.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_BASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

/**
 * @param bucket storage bucket id
 * @param path   object path within the bucket
 * @param bust   append a cache-buster — pass after replacing an image at a
 *               stable path, or the browser keeps showing the previous file
 * @returns the public URL, or null when either argument is missing
 */
export function publicStorageUrl(
  bucket: string | null | undefined,
  path: string | null | undefined,
  bust?: boolean,
): string | null {
  if (!bucket || !path) return null;
  const url = `${STORAGE_BASE}/storage/v1/object/public/${bucket}/${path}`;
  return bust ? `${url}?t=${Date.now()}` : url;
}
