// src/app/api/blog/admin/_lib.ts
// Shared helpers for blog admin API routes (mirrors products admin pattern).

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export async function requireAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false as const, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false as const, status: 401 as const, message: "Authentication required" };
  return { ok: true as const, user: data.user };
}

/** One slug implementation for client and server — see utils/slug.ts. */
export { slugify } from "@/utils/slug";

/** Select fragment shared by list + detail endpoints. */
export const POST_SELECT = `
  id, slug, title, excerpt, content, content_format, cover_image,
  author, author_id, tags, is_published, published_at, created_at, updated_at, revision,
  blog_authors ( id, slug, name, avatar_url ),
  blog_post_tags ( blog_tags ( id, slug, name ) )
`;

/** Full author record — the dashboard byline editor reads and writes all of these. */
export const AUTHOR_SELECT =
  "id, slug, name, avatar_url, bio, website_url, github_url, bluesky_url, x_url";

/** Image library row shape. */
export const IMAGE_SELECT = "id, post_id, bucket_name, object_path, alt_text, created_at";
