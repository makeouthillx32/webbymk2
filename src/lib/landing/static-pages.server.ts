// lib/landing/static-pages.server.ts
import { createServerClient } from '@/utils/supabase/server';
import { resolveCurrentZoneKey } from '@/lib/zoneContext';
import {
  fetchPublishedStaticPageForZone,
  type StaticPagesClient,
  type StaticPageRow,
} from './static-pages.resolve';

export type { StaticPageRow } from './static-pages.resolve';

/**
 * Fetch a published static page by slug FOR THE CURRENT ZONE (server-side
 * only). Used by /pages/[slug], /legal/[slug], inline static_html sections and
 * /api/static-pages/[slug]. A zone without its own row gets null (→ 404),
 * never another zone's page — see static-pages.resolve.ts.
 */
export async function getPublishedStaticPageBySlug(
  slug: unknown
): Promise<StaticPageRow | null> {
  const zoneKey = await resolveCurrentZoneKey();
  const supabase = await createServerClient();
  return fetchPublishedStaticPageForZone(
    supabase as unknown as StaticPagesClient,
    zoneKey,
    slug,
  );
}

/**
 * Fetch all published static pages of the current zone (sitemap, navigation…).
 */
export async function getAllPublishedStaticPages(): Promise<StaticPageRow[]> {
  const zoneKey = await resolveCurrentZoneKey();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('static_pages')
    .select('*')
    .eq('zone_key', zoneKey)
    .eq('is_published', true)
    .order('slug', { ascending: true });

  if (error) {
    console.error('[static-pages.server] Error fetching pages:', error);
    return [];
  }

  return ((data || []) as StaticPageRow[]).filter((row) => row.zone_key === zoneKey);
}
