// lib/landing/static-pages.server.ts
import { createServerClient } from '@/utils/supabase/server';

export type StaticPageRow = {
  id: string;
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

/**
 * Normalize slug by removing leading slashes
 * "privacy-policy" -> "privacy-policy"
 * "/privacy-policy" -> "privacy-policy"
 */
function normalizeSlug(slug: unknown): string | null {
  if (typeof slug !== 'string') return null;

  const s = slug.trim();
  if (!s) return null;

  // Remove leading slashes
  return s.replace(/^\/+/, '');
}

/**
 * Fetch a published static page by slug (server-side only)
 * Used by dynamic routes: /pages/[slug] and /legal/[slug]
 */
export async function getPublishedStaticPageBySlug(
  slug: unknown
): Promise<StaticPageRow | null> {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;

  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('static_pages')
    .select('*')
    .eq('slug', normalized)
    .eq('is_published', true)
    .maybeSingle();

  if (error) {
    console.error('[static-pages.server] Error fetching page:', error);
    return null;
  }

  return data;
}

/**
 * Fetch all published static pages (for sitemap, navigation, etc.)
 */
export async function getAllPublishedStaticPages(): Promise<StaticPageRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('static_pages')
    .select('*')
    .eq('is_published', true)
    .order('slug', { ascending: true });

  if (error) {
    console.error('[static-pages.server] Error fetching pages:', error);
    return [];
  }

  return data || [];
}