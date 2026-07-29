"use client";
// hooks/blog/useBlogPosts.ts
// Owns the blog manager's list state: filters, debounced search, reload,
// delete and inline publish toggling. The page component stays presentational.

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { blogAdmin } from "@/lib/blog/client";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { BlogPostRow, PostStatusFilter } from "@/types/blog";

export interface UseBlogPostsResult {
  posts: BlogPostRow[];
  loading: boolean;
  error: string | null;
  search: string;
  setSearch: (value: string) => void;
  status: PostStatusFilter;
  setStatus: (value: PostStatusFilter) => void;
  reload: () => Promise<void>;
  deletePost: (post: BlogPostRow) => Promise<boolean>;
  togglePublished: (post: BlogPostRow) => Promise<void>;
  /** True while any row-level mutation is in flight. */
  mutatingId: string | null;
}

export function useBlogPosts(): UseBlogPostsResult {
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PostStatusFilter>("all");
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);
  const requestRef = useRef<AbortController | null>(null);

  const fetchPosts = useCallback(
    async (q: string, statusFilter: PostStatusFilter) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      setLoading(true);
      setError(null);
      try {
        const data = await blogAdmin.listPosts({
          status: statusFilter,
          q: q.trim() || undefined,
          signal: controller.signal,
        });
        setPosts(data);
      } catch (cause) {
        if ((cause as Error)?.name === "AbortError") return;
        const message = cause instanceof Error ? cause.message : "Failed to load posts";
        setError(message);
        setPosts([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPosts(debouncedSearch, status);
    return () => requestRef.current?.abort();
  }, [debouncedSearch, status, fetchPosts]);

  const reload = useCallback(
    () => fetchPosts(debouncedSearch, status),
    [fetchPosts, debouncedSearch, status],
  );

  const deletePost = useCallback(
    async (post: BlogPostRow) => {
      setMutatingId(post.id);
      try {
        await blogAdmin.deletePost(post.id);
        setPosts((current) => current.filter((row) => row.id !== post.id));
        toast.success("Post deleted");
        return true;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Delete failed");
        return false;
      } finally {
        setMutatingId(null);
      }
    },
    [],
  );

  const togglePublished = useCallback(
    async (post: BlogPostRow) => {
      const next = !post.is_published;
      setMutatingId(post.id);
      // Optimistic — the list is the only reader of this flag.
      setPosts((current) =>
        current.map((row) => (row.id === post.id ? { ...row, is_published: next } : row)),
      );
      try {
        await blogAdmin.setPublished(post.id, next);
        toast.success(next ? "Post published" : "Moved back to drafts");
        if (next && !post.published_at) await reload(); // pick up the stamped date
      } catch (cause) {
        setPosts((current) =>
          current.map((row) => (row.id === post.id ? { ...row, is_published: !next } : row)),
        );
        toast.error(cause instanceof Error ? cause.message : "Could not change status");
      } finally {
        setMutatingId(null);
      }
    },
    [reload],
  );

  return {
    posts,
    loading,
    error,
    search,
    setSearch,
    status,
    setStatus,
    reload,
    deletePost,
    togglePublished,
    mutatingId,
  };
}
