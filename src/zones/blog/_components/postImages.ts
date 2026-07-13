// src/zones/blog/_components/postImages.ts
// Predictable post-image slots.
//
// Convention: every image belonging to a post lives in the blog-images bucket
// at  posts/<slug>/<slot>.<ext>  where <slot> is "cover", "image-1", "image-2"…
// Markdown (and cover_image) can reference a slot as  post://<slot>  BEFORE the
// file exists — authors and generators never need to know the final URL. At
// render time the slot is resolved against what is actually in storage.

import { createClient } from "@/utils/supabase/server";
import { getPublicStorageObjectUrl } from "@/lib/siteOpenGraph";

export const POST_REF = /post:\/\/([\w][\w.-]*)/g;

/** basename without extension: "image-1.png" → "image-1" */
function slotOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

/**
 * List posts/<slug>/ in the blog-images bucket and return slot → public URL.
 * Missing folder or storage error returns an empty map (refs stay literal).
 */
export async function fetchPostImageMap(slug: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("blog-images")
      .list(`posts/${slug}`, { limit: 100 });
    if (error || !data) return map;
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
      if (url) map.set(slotOf(f.name), url);
    }
  } catch {
    /* resolution is best-effort — unresolved refs render as-is */
  }
  return map;
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
