"use client";
// Import a .dra draft into the open editor. Frontmatter fills the whole form,
// the body becomes markdown with post:// slot refs and resolved [[wiki]] links,
// and any images dropped alongside the file are matched by name and uploaded
// into their slots.

import { useCallback, useState } from "react";
import { toast } from "react-hot-toast";
import { parseDra } from "@/lib/blog/parseDra";
import { uploadPostSlot } from "@/lib/blog/images";
import type { BlogPostDraft } from "@/types/blog";

const MAX_DRA_BYTES = 2 * 1024 * 1024;

export interface UseDraImportArgs {
  hasContent: boolean;
  replaceDraft: (next: Partial<BlogPostDraft>) => void;
  setTagIds: (ids: string[]) => void;
  resolveTags: (names: string[]) => Promise<string[]>;
  resolveAuthorByName: (name: string) => Promise<{ id: string } | null>;
  refreshSlots: () => Promise<void>;
}

export function useDraImport({
  hasContent,
  replaceDraft,
  setTagIds,
  resolveTags,
  resolveAuthorByName,
  refreshSlots,
}: UseDraImportArgs) {
  const [importing, setImporting] = useState(false);

  const importDra = useCallback(
    async (draFile: File, siblings: File[] = []) => {
      if (draFile.size > MAX_DRA_BYTES) {
        toast.error(".dra files must be 2 MB or smaller");
        return;
      }
      if (hasContent && !window.confirm(`Replace the current draft with ${draFile.name}?`)) return;

      let parsed;
      try {
        parsed = parseDra((await draFile.text()).replace(/^﻿/, ""));
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : "Could not parse that .dra file");
        return;
      }

      setImporting(true);
      try {
        const [tagIds, author] = await Promise.all([
          resolveTags(parsed.tags),
          parsed.author ? resolveAuthorByName(parsed.author) : Promise.resolve(null),
        ]);
        setTagIds(tagIds);

        replaceDraft({
          slug: parsed.slug,
          title: { en: parsed.title, de: parsed.titleDe },
          excerpt: { en: parsed.excerpt, de: parsed.excerptDe },
          content: { en: parsed.content, de: parsed.contentDe },
          content_format: "md",
          cover_image: parsed.cover,
          ...(author ? { author_id: author.id } : {}),
          is_published: parsed.publish,
          published_at: parsed.publishedAt,
        });

        // Fill slots from images dropped alongside the .dra (matched by name).
        const awaiting: string[] = [];
        for (const ref of parsed.slotFiles) {
          const match = siblings.find(
            (file) =>
              file.name.toLowerCase() === ref.localName.toLowerCase() &&
              file.type.startsWith("image/"),
          );
          if (!match) {
            awaiting.push(`${ref.slot} (${ref.localName})`);
            continue;
          }
          try {
            await uploadPostSlot({ slug: parsed.slug, slot: ref.slot, file: match });
          } catch (cause) {
            toast.error(`${ref.slot}: ${cause instanceof Error ? cause.message : "upload failed"}`);
          }
        }
        await refreshSlots();

        toast.success(`${draFile.name} imported`);
        if (awaiting.length > 0) {
          toast(`Still needs: ${awaiting.join(", ")} — drop them on the editor`, { duration: 6000 });
        }
      } finally {
        setImporting(false);
      }
    },
    [hasContent, replaceDraft, refreshSlots, resolveAuthorByName, resolveTags, setTagIds],
  );

  return { importDra, importing };
}
