// app/dashboard/[id]/settings/static-pages/_components/createPage.tsx
import type { SupabaseClient } from "@supabase/supabase-js";

export type StaticPageRow = {
  id: string;
  slug: string;
  title: string;
  content: string;
  content_format: "html" | "markdown";
  meta_description: string | null;
  meta_keywords: string | null;
  og_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type CreateStaticPageInput = {
  title?: string;
  slug: string;
  content?: string;
  content_format: "html" | "markdown";
  meta_description?: string;
  is_published: boolean;
};

export function normalizeSlug(input: string) {
  return (input || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-_/]/g, "")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function slugToTitle(slug: string) {
  const clean = normalizeSlug(slug).split("/").pop() || slug;
  return clean
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Creates a row in public.static_pages.
 * NOTE: Your table has NO defaults for id/created_at/updated_at, so we set them here.
 */
export async function createStaticPage(
  supabase: SupabaseClient,
  input: CreateStaticPageInput
) {
  const slug = normalizeSlug(input.slug);
  if (!slug) throw new Error("Slug is required.");

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const payload: StaticPageRow = {
    id,
    slug,
    title: (input.title || "").trim() || slugToTitle(slug),
    content: input.content ?? "",
    content_format: input.content_format,
    meta_description: (input.meta_description || "").trim() || null,
    meta_keywords: null,
    og_image_url: null,
    is_published: input.is_published,
    published_at: input.is_published ? now : null,
    version: 1,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("static_pages")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as StaticPageRow;
}
