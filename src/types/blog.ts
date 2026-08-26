// types/blog.ts
// ─────────────────────────────────────────────────────────────────────────────
// Blog domain types shared by the dashboard CRUD manager, the blog zone, the
// admin API client and the ingest agent. Mirrors the public.blog_* schema.
// ─────────────────────────────────────────────────────────────────────────────

/** Locales the blog is authored in. Add here, forms follow automatically. */
export const BLOG_LOCALES = ["en", "de"] as const;
export type Locale = (typeof BLOG_LOCALES)[number];

/** jsonb columns shaped `{ en: "…", de: "…" }`. Kept loose for forward locales. */
export type Localized = Record<string, string>;

export type ContentFormat = "md" | "html";
export type PostStatusFilter = "all" | "published" | "draft";

export interface BlogTag {
  id: string;
  slug: string;
  name: string;
}

export interface BlogAuthor {
  id: string;
  slug: string;
  name: string;
  avatar_url?: string | null;
  bio?: Localized | null;
  website_url?: string | null;
  github_url?: string | null;
  bluesky_url?: string | null;
  x_url?: string | null;
}

/** Payload the editor owns — everything writable on a post. */
export interface BlogPostDraft {
  id?: string;
  slug: string;
  title: Localized;
  excerpt: Localized;
  content: Localized;
  content_format: ContentFormat;
  cover_image: string | null;
  author_id: string | null;
  is_published: boolean;
  published_at: string | null;
  /** Present on rows loaded from the API; stripped before write. */
  blog_post_tags?: { blog_tags: BlogTag }[];
}

/** A row as returned by GET /api/blog/admin. */
export interface BlogPostRow extends BlogPostDraft {
  id: string;
  created_at: string;
  updated_at?: string | null;
  /** Bumped by a DB trigger on every content-changing save. Starts at 1. */
  revision?: number;
  /** Legacy free-text author, superseded by author_id. */
  author?: string | null;
  blog_authors?: Pick<BlogAuthor, "id" | "slug" | "name" | "avatar_url"> | null;
  blog_post_tags?: { blog_tags: BlogTag }[];
}

/** Row in public.blog_post_images — the reusable image library. */
export interface BlogImageRow {
  id: string;
  post_id: string | null;
  bucket_name: string;
  object_path: string;
  alt_text: string | null;
  created_at?: string;
}

/** Tag mutation understood by the admin API (`tag_command`). */
export interface TagReplaceCommand {
  command: "tags.replace";
  tag_ids: string[];
}

export const EMPTY_LOCALIZED: Localized = { en: "", de: "" };

export const EMPTY_POST: BlogPostDraft = {
  slug: "",
  title: { ...EMPTY_LOCALIZED },
  excerpt: { ...EMPTY_LOCALIZED },
  content: { ...EMPTY_LOCALIZED },
  content_format: "md",
  cover_image: null,
  author_id: null,
  is_published: false,
  published_at: null,
};
