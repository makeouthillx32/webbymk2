// src/zones/blog/_components/postImages.ts
// Predictable post-image slots.
//
// Convention: every image belonging to a post lives in the blog-images bucket
// at  posts/<slug>/<slot>.<ext>  where <slot> is "cover", "image-1", "image-2"…
// Markdown (and cover_image) can reference a slot as  post://<slot>  BEFORE the
// file exists — authors and generators never need to know the final URL. At
// render time the slot is resolved against what is actually in storage.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { getPublicStorageObjectUrl } from "@/lib/siteOpenGraph";

export const POST_REF = /post:\/\/([\w][\w.-]*)/g;

/** basename without extension: "image-1.png" → "image-1" */
function slotOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

// Plain anon client (no cookies()) — this only lists a PUBLIC storage folder
// for rendering, needs no session, and (critically) next/cache's unstable_cache
// forbids calling dynamic APIs like cookies()/headers() inside the cached fn,
// which the cookie-bound @/utils/supabase/server client pulls in on every call.
let _storageClient: ReturnType<typeof createSupabaseClient> | null = null;
function storageClient() {
  if (!_storageClient) {
    _storageClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _storageClient;
}

/**
 * List posts/<slug>/ in the blog-images bucket → [slot, public URL][].
 *
 * This is the single biggest latency source on the post page and "More to
 * Read": every related-post cover (up to 4) plus the post's own body refs
 * each cost a full Storage API round trip, uncached, on every request — slow
 * self-hosted Supabase/kong made this visibly "pop in late" rather than
 * missing. 30s unstable_cache turns repeat views (and the homepage warming
 * the same slugs "More to Read" later serves) into in-process cache hits.
 * Images/slots don't change often enough for 30s staleness to matter, and
 * because unenter (dashboard) and blog run as separate zone containers with
 * independent caches, there's no cross-zone revalidateTag path anyway — a
 * short TTL is the simple, safe answer over wiring one up.
 */
const fetchPostImageEntries = unstable_cache(
  async (slug: string): Promise<[string, string][]> => {
    const entries: [string, string][] = [];
    try {
      const { data, error } = await storageClient()
        .storage.from("blog-images")
        .list(`posts/${slug}`, { limit: 100 });
      if (error || !data) return entries;
      for (const f of data) {
        if (!f.name) continue;
        // Build a BROWSER-safe public URL. supabase's getPublicUrl() returns the
        // internal split-horizon host (kong:8000) which browsers can't resolve;
        // getPublicStorageObjectUrl prefers NEXT_PUBLIC_SUPABASE_URL_BROWSER.
        const url = getPublicStorageObjectUrl(
          "blog-images",
          `posts/${slug}/${f.name}`,
          f.updated_at ?? f.created_at ?? undefined,
        );
        if (url) entries.push([slotOf(f.name), url]);
      }
    } catch {
      /* resolution is best-effort — unresolved refs render as-is */
    }
    return entries;
  },
  ["blog-post-image-map"],
  { revalidate: 30 },
);

/** Missing folder or storage error returns an empty map (refs stay literal). */
export async function fetchPostImageMap(slug: string): Promise<Map<string, string>> {
  return new Map(await fetchPostImageEntries(slug));
}

/** Resolve a slot-based cover for post cards and metadata. */
export async function resolvePostCover(
  slug: string,
  coverImage: string | null,
): Promise<string | null> {
  if (!coverImage?.startsWith("post://")) return coverImage;

  const map = await fetchPostImageMap(slug);
  return map.get(coverImage.slice("post://".length)) ?? null;
}

/** Replace post://<slot> references using the map; unknown slots left intact. */
export function resolvePostRefs(text: string, map: Map<string, string>): string {
  if (!text || !text.includes("post://")) return text;
  return text.replace(POST_REF, (whole, slot: string) => map.get(slot) ?? whole);
}
