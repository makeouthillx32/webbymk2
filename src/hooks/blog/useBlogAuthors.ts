"use client";
// hooks/blog/useBlogAuthors.ts
// Author catalogue with full-record create/update. blog_authors carries bio,
// avatar and social links that the old editor never exposed — the byline block
// on the blog renders them, so they are worth filling in.

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { blogAdmin } from "@/lib/blog/client";
import type { BlogAuthor } from "@/types/blog";

export interface UseBlogAuthorsResult {
  authors: BlogAuthor[];
  loading: boolean;
  createAuthor: (author: Partial<BlogAuthor> & { name: string }) => Promise<BlogAuthor | null>;
  updateAuthor: (id: string, patch: Partial<BlogAuthor>) => Promise<BlogAuthor | null>;
  /** Find by name (case-insensitive) or create — used by the .dra importer. */
  resolveAuthorByName: (name: string) => Promise<BlogAuthor | null>;
  refresh: () => Promise<void>;
}

function sortByName(authors: BlogAuthor[]): BlogAuthor[] {
  return [...authors].sort((a, b) => a.name.localeCompare(b.name));
}

export function useBlogAuthors(): UseBlogAuthorsResult {
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setAuthors(sortByName(await blogAdmin.listAuthors()));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to load authors");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    blogAdmin
      .listAuthors(controller.signal)
      .then((data) => setAuthors(sortByName(data)))
      .catch((cause: Error) => {
        if (cause?.name !== "AbortError") toast.error(cause?.message ?? "Failed to load authors");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const absorb = useCallback((author: BlogAuthor) => {
    setAuthors((current) => sortByName([...current.filter((row) => row.id !== author.id), author]));
  }, []);

  const createAuthor = useCallback(
    async (author: Partial<BlogAuthor> & { name: string }) => {
      const name = author.name.trim();
      if (!name) return null;
      try {
        const created = await blogAdmin.createAuthor({ ...author, name });
        absorb(created);
        toast.success(`${created.name} added`);
        return created;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Author create failed");
        return null;
      }
    },
    [absorb],
  );

  const updateAuthor = useCallback(
    async (id: string, patch: Partial<BlogAuthor>) => {
      try {
        const updated = await blogAdmin.updateAuthor(id, patch);
        absorb(updated);
        toast.success("Author saved");
        return updated;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Author update failed");
        return null;
      }
    },
    [absorb],
  );

  const resolveAuthorByName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const existing = authors.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) return existing;
      return createAuthor({ name: trimmed });
    },
    [authors, createAuthor],
  );

  return { authors, loading, createAuthor, updateAuthor, resolveAuthorByName, refresh };
}
