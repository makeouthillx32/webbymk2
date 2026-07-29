"use client";
// hooks/blog/usePostForm.ts
// Draft state for one post: localized fields, tag selection, dirty tracking and
// save. Knows nothing about layout, so the editor can be re-arranged freely.

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { blogAdmin, toWritePayload } from "@/lib/blog/client";
import { effectiveSlug, postTagIds, toDraft } from "@/lib/blog/posts";
import type { BlogPostDraft, BlogPostRow, Locale, Localized } from "@/types/blog";

export type LocalizedField = "title" | "excerpt" | "content";

export interface UsePostFormResult {
  draft: BlogPostDraft;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Slug the post will save under, derived from the EN title until set. */
  slug: string;
  tagIds: string[];
  setTagIds: (ids: string[]) => void;
  dirty: boolean;
  saving: boolean;
  isNew: boolean;
  setField: <K extends keyof BlogPostDraft>(key: K, value: BlogPostDraft[K]) => void;
  setLocalizedField: (field: LocalizedField, value: string, locale?: Locale) => void;
  /** Replace the whole draft (used by the .dra importer). */
  replaceDraft: (next: Partial<BlogPostDraft>) => void;
  save: () => Promise<boolean>;
}

export function usePostForm({
  post,
  onSaved,
}: {
  post: BlogPostRow | BlogPostDraft | null;
  onSaved?: (result: { id: string; slug: string }) => void;
}): UsePostFormResult {
  const [draft, setDraft] = useState<BlogPostDraft>(() => toDraft(post));
  const [locale, setLocale] = useState<Locale>("en");
  const [tagIds, setTagIds] = useState<string[]>(() => (post ? postTagIds(post) : []));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const savedIdRef = useRef<string | undefined>(draft.id);

  const markDirty = useCallback(() => setDirty(true), []);

  const setField = useCallback<UsePostFormResult["setField"]>(
    (key, value) => {
      setDraft((current) => ({ ...current, [key]: value }));
      markDirty();
    },
    [markDirty],
  );

  const setLocalizedField = useCallback(
    (field: LocalizedField, value: string, forLocale?: Locale) => {
      const target = forLocale ?? locale;
      setDraft((current) => ({
        ...current,
        [field]: { ...(current[field] as Localized), [target]: value },
      }));
      markDirty();
    },
    [locale, markDirty],
  );

  const replaceDraft = useCallback(
    (next: Partial<BlogPostDraft>) => {
      setDraft((current) => ({ ...current, ...next }));
      markDirty();
    },
    [markDirty],
  );

  const updateTagIds = useCallback(
    (ids: string[]) => {
      setTagIds(ids);
      markDirty();
    },
    [markDirty],
  );

  const slug = useMemo(() => effectiveSlug(draft), [draft]);

  const save = useCallback(async () => {
    if (!draft.title.en.trim()) {
      toast.error("An English title is required");
      return false;
    }

    setSaving(true);
    try {
      const payload = toWritePayload({ ...draft, slug }, tagIds);
      const id = savedIdRef.current;

      let result: { id: string; slug: string };
      if (id) {
        await blogAdmin.updatePost(id, payload);
        result = { id, slug };
      } else {
        result = await blogAdmin.createPost(payload);
      }

      savedIdRef.current = result.id;
      setDraft((current) => ({ ...current, id: result.id, slug: result.slug }));
      setDirty(false);
      toast.success(id ? "Post updated" : "Post created");
      onSaved?.(result);
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, slug, tagIds, onSaved]);

  return {
    draft,
    locale,
    setLocale,
    slug,
    tagIds,
    setTagIds: updateTagIds,
    dirty,
    saving,
    isNew: !savedIdRef.current,
    setField,
    setLocalizedField,
    replaceDraft,
    save,
  };
}
