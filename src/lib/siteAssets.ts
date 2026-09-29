// src/lib/siteAssets.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolver for hot-swappable landing assets (see
// supabase/migrations/20260905050000_site_assets_registry.sql).
//
// The whole point is that a missing row is NEVER a broken page: every lookup
// takes a `fallback` — the path the asset lives at today under /public — and
// returns it whenever the registry has nothing active for that key, or the DB
// is unreachable. So this can ship before a single file is uploaded and change
// nothing, and an asset goes live the moment a row appears.
//
// Usage (server component):
//
//   const assets = await getSiteAssets("core-landing", {
//     "hero.video.webm": "/video/hero-video.webm",
//     "hero.video.mp4":  "/video/hero-video.mp4",
//   });
//   <source src={assets["hero.video.webm"]} type="video/webm" />
//
// Prefer the batched `getSiteAssets` over N× `getSiteAsset` — one query per
// section beats one per file.
// Dynamic import inside getSiteAssets avoids pulling next/headers into client bundles

/** Registry scopes. One per landing surface. */
export type SiteAssetScope = "core-landing" | "labs-landing" | "shop-landing";

const STORAGE_BASE =
  "https://db.unenter.live/storage/v1/object/public/landing-assets";

/**
 * Known storage URLs for the core landing assets.
 *
 * These are the FALLBACKS, and they are deliberately storage URLs rather than
 * `/public` paths: as of 2026-09-05 the source files were removed from the repo
 * (12.9 MB that previously shipped inside every zone image), so there is no
 * local copy to fall back to any more.
 *
 * The layering is therefore:
 *   site_assets row  →  hot-swappable, wins when present
 *   these constants  →  same files, fixed URLs, used if the registry is empty
 *                       or unreachable
 *
 * That keeps a registry outage from blanking the hero while still letting a
 * row override any asset with no rebuild. Client components (which cannot
 * await the resolver) import these directly.
 */
export const LANDING_ASSETS = {
  heroVideoWebm: `${STORAGE_BASE}/core/hero-video.webm`,
  heroVideoMp4: `${STORAGE_BASE}/core/hero-video.mp4`,
  bannerBackdropWebm: `${STORAGE_BASE}/core/banner-backdrop.webm`,
  bannerModelGlb: `${STORAGE_BASE}/core/unenter.glb`,
} as const;

export type SiteAssetRow = {
  asset_key: string;
  public_url: string;
  kind: string;
  format: string | null;
};

/**
 * Resolve many keys at once.
 *
 * @param scope     which landing surface
 * @param fallbacks map of asset_key → bundled /public path used when the
 *                  registry has no active row (or the query fails)
 * @returns         same keys, each mapped to the live URL or its fallback
 */
export async function getSiteAssets<K extends string>(
  scope: SiteAssetScope,
  fallbacks: Record<K, string>
): Promise<Record<K, string>> {
  // Start from the fallbacks so every key is always present in the result —
  // callers can index without null checks.
  const resolved = { ...fallbacks } as Record<K, string>;
  const keys = Object.keys(fallbacks) as K[];
  if (keys.length === 0) return resolved;

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:8001";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.dummy";
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("site_assets")
      .select("asset_key, public_url, kind, format")
      .eq("scope", scope)
      .eq("is_active", true)
      .in("asset_key", keys as string[]);

    if (error) {
      // A registry outage must degrade to the bundled asset, not to a blank
      // hero. Log and fall through with fallbacks intact.
      console.error(`[siteAssets] lookup failed for scope "${scope}":`, error.message);
      return resolved;
    }

    for (const row of (data ?? []) as SiteAssetRow[]) {
      if (row.public_url && (keys as string[]).includes(row.asset_key)) {
        resolved[row.asset_key as K] = row.public_url;
      }
    }
  } catch (err) {
    console.error(`[siteAssets] resolver threw for scope "${scope}":`, err);
  }

  return resolved;
}

/** Single-key convenience wrapper. Prefer getSiteAssets for more than one. */
export async function getSiteAsset(
  scope: SiteAssetScope,
  key: string,
  fallback: string
): Promise<string> {
  const out = await getSiteAssets(scope, { [key]: fallback } as Record<string, string>);
  return out[key];
}
