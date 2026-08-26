// src/zones/blog/_components/helpers.ts
// Shared helpers for the blog zone.

export interface BlogPostSummary {
  id:          string;
  slug:        string;
  title:       string;
  excerpt:     string;
  coverImage:  string | null;
  author:      string | null;
  tags:        string[];
  publishedAt: string | null;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year:  "numeric",
    month: "long",
    day:   "numeric",
  });
}

export function slugifyTag(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Estimated read time from HTML content, ~225 wpm. */
export function readTime(html: string): string {
  const words = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 225))} min read`;
}
