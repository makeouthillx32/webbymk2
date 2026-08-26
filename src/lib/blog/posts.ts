// lib/blog/posts.ts
// Presentation helpers for blog posts. Pure functions — no fetching, no state.

import { slugify } from "@/utils/slug";
import {
  BLOG_LOCALES,
  EMPTY_POST,
  type BlogPostDraft,
  type BlogPostRow,
  type BlogTag,
  type Locale,
  type Localized,
} from "@/types/blog";
import { BLOG_ORIGIN } from "./constants";

/** Best available title for a locale, falling back to EN, then the slug. */
export function postTitle(post: Pick<BlogPostRow, "title" | "slug">, locale: Locale = "en"): string {
  return post.title?.[locale]?.trim() || post.title?.en?.trim() || post.slug;
}

export function postExcerpt(post: Pick<BlogPostRow, "excerpt">, locale: Locale = "en"): string {
  return post.excerpt?.[locale]?.trim() || post.excerpt?.en?.trim() || "";
}

export function postAuthorName(post: BlogPostRow): string {
  return post.blog_authors?.name ?? post.author ?? "—";
}

export function postTags(post: Pick<BlogPostRow, "blog_post_tags">): BlogTag[] {
  return (post.blog_post_tags ?? []).map((entry) => entry.blog_tags).filter(Boolean);
}

export function postTagIds(post: Pick<BlogPostRow, "blog_post_tags">): string[] {
  return postTags(post).map((tag) => tag.id);
}

export function postUrl(slug: string): string {
  return `${BLOG_ORIGIN}/${slug}`;
}

/** Slug the post will actually be saved under, before the user sets one. */
export function effectiveSlug(draft: Pick<BlogPostDraft, "slug" | "title">): string {
  return draft.slug?.trim() || slugify(draft.title?.en ?? "");
}

/** Which locales have any content at all — drives the EN/DE completeness dots. */
export function filledLocales(draft: BlogPostDraft): Locale[] {
  return BLOG_LOCALES.filter((locale) =>
    Boolean(draft.title?.[locale]?.trim() || draft.content?.[locale]?.trim()),
  );
}

export type PostStatus = "published" | "scheduled" | "draft";

/** A future published_at on a published post means scheduled, not live. */
export function postStatus(post: Pick<BlogPostRow, "is_published" | "published_at">): PostStatus {
  if (!post.is_published) return "draft";
  if (post.published_at && new Date(post.published_at).getTime() > Date.now()) return "scheduled";
  return "published";
}

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  published: "Published",
  scheduled: "Scheduled",
  draft: "Draft",
};

export function formatPostDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** ISO string → value for `<input type="datetime-local">` in local time. */
export function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localized(value: Localized | null | undefined): Localized {
  return { en: value?.en ?? "", de: value?.de ?? "", ...(value ?? {}) };
}

/** Normalise an API row (or nothing) into a complete editor draft. */
export function toDraft(post: BlogPostRow | BlogPostDraft | null): BlogPostDraft {
  if (!post) return { ...EMPTY_POST, title: { ...EMPTY_POST.title }, excerpt: { ...EMPTY_POST.excerpt }, content: { ...EMPTY_POST.content } };
  return {
    id: post.id,
    slug: post.slug ?? "",
    title: localized(post.title),
    excerpt: localized(post.excerpt),
    content: localized(post.content),
    content_format: post.content_format === "html" ? "html" : "md",
    cover_image: post.cover_image ?? null,
    author_id: post.author_id ?? null,
    is_published: Boolean(post.is_published),
    published_at: post.published_at ?? null,
    blog_post_tags: post.blog_post_tags,
  };
}
