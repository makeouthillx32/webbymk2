// src/lib/landing/static-pages.resolve.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone-scoped static page lookup. Pure (takes the Supabase client as an
// argument) so the fail-closed rules are unit-testable without next/headers.
//
// Until 2026-11-03 static_pages had one row per slug shared by every zone, so
// shop.unenter.live/pages/shipping served Unenter Labs' peptide/vial policy.
// Rows now carry zone_key and a page resolves by (zone_key, slug) only:
//   • no zone → no page (never "any zone's row")
//   • no row for this zone → no page (never another zone's row)
//   • a returned row whose zone_key/slug don't match → discarded
// ─────────────────────────────────────────────────────────────────────────────

export type StaticPageRow = {
  id: string;
  zone_key: string;
  slug: string;
  title: string;
  content: string;
  content_format: 'html' | 'markdown';
  meta_description: string | null;
  meta_keywords: string[] | null;
  og_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

type MaybeSingleResult = { data: unknown; error: { message: string } | null };

/** The slice of the Supabase query builder this lookup uses. */
export interface StaticPagesQueryBuilder {
  eq(column: string, value: unknown): StaticPagesQueryBuilder;
  maybeSingle(): PromiseLike<MaybeSingleResult>;
}

export interface StaticPagesClient {
  from(table: 'static_pages'): { select(columns: string): StaticPagesQueryBuilder };
}

/** "/privacy-policy" → "privacy-policy"; non-strings/blank → null. */
export function normalizeStaticPageSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;
  const s = slug.trim().replace(/^\/+/, '');
  return s || null;
}

export function normalizeZoneKey(zone: unknown): string | null {
  if (typeof zone !== 'string') return null;
  const z = zone.trim().toLowerCase();
  return z || null;
}

/**
 * The published page `slug` OWNED BY `zoneKey`, or null. Never returns a row
 * belonging to another zone.
 */
export async function fetchPublishedStaticPageForZone(
  client: StaticPagesClient,
  zoneKey: unknown,
  slug: unknown,
): Promise<StaticPageRow | null> {
  const zone = normalizeZoneKey(zoneKey);
  const normalized = normalizeStaticPageSlug(slug);
  if (!zone || !normalized) return null;

  const { data, error } = await client
    .from('static_pages')
    .select('*')
    .eq('zone_key', zone)
    .eq('slug', normalized)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('[static-pages] Error fetching page:', error.message);
    return null;
  }

  const row = data as StaticPageRow | null;
  if (!row || row.zone_key !== zone || row.slug !== normalized || row.is_published !== true) {
    return null;
  }
  return row;
}
