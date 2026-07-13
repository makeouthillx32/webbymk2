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

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** Select fragment shared by list + detail endpoints. */
export const POST_SELECT = `
  id, slug, title, excerpt, content, content_format, cover_image,
  author, author_id, tags, is_published, published_at, created_at, updated_at,
  blog_authors ( id, slug, name, avatar_url ),
  blog_post_tags ( blog_tags ( id, slug, name ) )
`;
