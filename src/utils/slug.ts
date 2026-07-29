// utils/slug.ts
// Single slug implementation for the whole app. Client and server must agree,
// otherwise a post previewed at /foo-bar saves as /foo--bar and images written
// to posts/<slug>/ land in an orphaned folder.

const DEFAULT_MAX = 96;

/**
 * Lowercase, collapse every non-alphanumeric run to a single hyphen, trim
 * leading/trailing hyphens, cap the length.
 */
export function slugify(input: string, maxLength: number = DEFAULT_MAX): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/** True when `value` is already a clean slug (round-trips through slugify). */
export function isSlug(value: string, maxLength: number = DEFAULT_MAX): boolean {
  return Boolean(value) && slugify(value, maxLength) === value;
}
