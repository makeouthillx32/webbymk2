// lib/blog/client.ts
// ─────────────────────────────────────────────────────────────────────────────
// Typed client for /api/blog/admin/**. Every dashboard fetch goes through here
// so the `{ ok, data, error }` envelope is unwrapped in exactly one place and
// components never hand-roll a URL or forget an error branch.
//
// Throws ApiError (from lib/api) on any failure — callers wrap in try/catch and
// surface `error.message`.
// ─────────────────────────────────────────────────────────────────────────────

import { fetchJson } from "@/lib/api";
import type {
  BlogAuthor,
  BlogImageRow,
  BlogPostDraft,
  BlogPostRow,
  BlogTag,
  PostStatusFilter,
} from "@/types/blog";

const BASE = "/api/blog/admin";

export interface ListPostsParams {
  status?: PostStatusFilter;
  q?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/** Payload accepted by create/update — tags travel as a tag_command. */
export interface PostWritePayload extends Omit<BlogPostDraft, "id" | "blog_post_tags"> {
  tag_command?: { command: "tags.replace"; tag_ids: string[] };
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/** Strip read-only relations before sending a draft back to the API. */
export function toWritePayload(draft: BlogPostDraft, tagIds?: string[]): PostWritePayload {
  const { id: _id, blog_post_tags: _tags, ...writable } = draft;
  return {
    ...writable,
    ...(tagIds ? { tag_command: { command: "tags.replace" as const, tag_ids: tagIds } } : {}),
  };
}

export const blogAdmin = {
  // ── Posts ────────────────────────────────────────────────────────────────
  listPosts({ status = "all", q, limit, offset, signal }: ListPostsParams = {}) {
    return fetchJson<BlogPostRow[]>(`${BASE}${query({ status, q, limit, offset })}`, { signal });
  },

  getPost(id: string, signal?: AbortSignal) {
    return fetchJson<BlogPostRow>(`${BASE}/${id}`, { signal });
  },

  createPost(payload: PostWritePayload) {
    return fetchJson<{ id: string; slug: string }>(BASE, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  updatePost(id: string, payload: Partial<PostWritePayload>) {
    return fetchJson<unknown>(`${BASE}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  deletePost(id: string) {
    return fetchJson<unknown>(`${BASE}/${id}`, { method: "DELETE" });
  },

  /** Publish / unpublish without touching the rest of the post. */
  setPublished(id: string, isPublished: boolean) {
    return fetchJson<unknown>(`${BASE}/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_published: isPublished }),
    });
  },

  // ── Tags ─────────────────────────────────────────────────────────────────
  listTags(signal?: AbortSignal) {
    return fetchJson<BlogTag[]>(`${BASE}/tags`, { signal });
  },

  /** Create-or-find by name — the endpoint upserts. */
  resolveTag(name: string) {
    return fetchJson<BlogTag>(`${BASE}/tags`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  // ── Authors ──────────────────────────────────────────────────────────────
  listAuthors(signal?: AbortSignal) {
    return fetchJson<BlogAuthor[]>(`${BASE}/authors`, { signal });
  },

  createAuthor(author: Partial<BlogAuthor> & { name: string }) {
    return fetchJson<BlogAuthor>(`${BASE}/authors`, {
      method: "POST",
      body: JSON.stringify(author),
    });
  },

  updateAuthor(id: string, patch: Partial<BlogAuthor>) {
    return fetchJson<BlogAuthor>(`${BASE}/authors/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  deleteAuthor(id: string) {
    return fetchJson<unknown>(`${BASE}/authors/${id}`, { method: "DELETE" });
  },

  // ── Image metadata (files go browser → storage, rows come here) ──────────
  listImages(postId: string | null, signal?: AbortSignal) {
    return fetchJson<BlogImageRow[]>(`${BASE}/${postId ?? "unattached"}/images`, { signal });
  },

  recordImage(
    postId: string | null,
    image: { bucket_name: string; object_path: string; alt_text?: string | null },
  ) {
    return fetchJson<BlogImageRow>(`${BASE}/${postId ?? "unattached"}/images`, {
      method: "POST",
      body: JSON.stringify(image),
    });
  },
};

export type BlogAdminClient = typeof blogAdmin;
