import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "./admin/_lib";

export interface BlogTagRow {
  id: string;
  slug: string;
  name: string;
}

export interface ResolvedBlogTag extends BlogTagRow {
  created: boolean;
}

export async function listBlogTags(supabase: SupabaseClient): Promise<BlogTagRow[]> {
  const { data, error } = await supabase
    .from("blog_tags")
    .select("id, slug, name")
    .order("name");

  if (error) throw error;
  return (data ?? []) as BlogTagRow[];
}

export async function resolveBlogTags(
  supabase: SupabaseClient,
  names: string[],
): Promise<ResolvedBlogTag[]> {
  const rowsBySlug = new Map<string, { slug: string; name: string }>();

  for (const rawName of names) {
    const name = rawName.trim();
    const slug = slugify(name);
    if (!name || !slug) throw new Error(`Invalid tag name: ${rawName}`);
    rowsBySlug.set(slug, { slug, name });
  }

  const rows = [...rowsBySlug.values()];
  if (rows.length === 0) return [];

  const slugs = rows.map((row) => row.slug);
  const { data: existing, error: existingError } = await supabase
    .from("blog_tags")
    .select("slug")
    .in("slug", slugs);
  if (existingError) throw existingError;

  const existingSlugs = new Set((existing ?? []).map((tag) => tag.slug));
  const { data, error } = await supabase
    .from("blog_tags")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: false })
    .select("id, slug, name");
  if (error) throw error;

  return ((data ?? []) as BlogTagRow[])
    .map((tag) => ({ ...tag, created: !existingSlugs.has(tag.slug) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readTagReplaceCommand(body: any): { tagIds?: string[]; error?: string } {
  if (body?.tag_command !== undefined) {
    if (body.tag_command?.command !== "tags.replace") {
      return { error: "tag_command.command must be tags.replace" };
    }
    if (!Array.isArray(body.tag_command.tag_ids)) {
      return { error: "tag_command.tag_ids must be an array" };
    }
    if (body.tag_command.tag_ids.length > 12) {
      return { error: "A post can have at most 12 tags" };
    }
    if (body.tag_command.tag_ids.some((id: unknown) => typeof id !== "string" || !id)) {
      return { error: "tag_command.tag_ids must contain non-empty strings" };
    }
    return { tagIds: [...new Set(body.tag_command.tag_ids as string[])] };
  }

  // Backward compatibility for existing dashboard/API callers.
  if (Array.isArray(body?.tag_ids)) {
    const tagIds: string[] = (body.tag_ids as unknown[]).filter(
      (id: unknown): id is string => typeof id === "string" && id.length > 0,
    );
    return { tagIds: [...new Set<string>(tagIds)] };
  }

  return {};
}
