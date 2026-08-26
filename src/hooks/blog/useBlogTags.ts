"use client";
// hooks/blog/useBlogTags.ts
// Tag catalogue + create-or-find. Shared by the tag picker and the .dra
// importer, which needs to resolve a list of tag names to ids in one go.

import { useCallback, useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { blogAdmin } from "@/lib/blog/client";
import type { BlogTag } from "@/types/blog";

export interface UseBlogTagsResult {
  tags: BlogTag[];
  loading: boolean;
  /** Create-or-find a single tag by name and add it to the catalogue. */
  resolveTag: (name: string) => Promise<BlogTag | null>;
  /** Resolve many names (used when importing a .dra). Skips failures. */
  resolveTags: (names: string[]) => Promise<string[]>;
  refresh: () => Promise<void>;
}

function sortByName(tags: BlogTag[]): BlogTag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}

export function useBlogTags(): UseBlogTagsResult {
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTags(sortByName(await blogAdmin.listTags()));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Failed to load tags");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    blogAdmin
      .listTags(controller.signal)
      .then((data) => setTags(sortByName(data)))
      .catch((cause: Error) => {
        if (cause?.name !== "AbortError") toast.error(cause?.message ?? "Failed to load tags");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const absorb = useCallback((tag: BlogTag) => {
    setTags((current) => sortByName([...current.filter((row) => row.id !== tag.id), tag]));
  }, []);

  const resolveTag = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        const tag = await blogAdmin.resolveTag(trimmed);
        absorb(tag);
        return tag;
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Tag creation failed");
        return null;
      }
    },
    [absorb],
  );

  const resolveTags = useCallback(
    async (names: string[]) => {
      const ids: string[] = [];
      for (const name of names) {
        const tag = await resolveTag(name);
        if (tag) ids.push(tag.id);
      }
      return ids;
    },
    [resolveTag],
  );

  return { tags, loading, resolveTag, resolveTags, refresh };
}
