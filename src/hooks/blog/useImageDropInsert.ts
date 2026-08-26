"use client";
// hooks/blog/useImageDropInsert.ts
// The seamless bit: drop or paste an image anywhere in the content editor and
// its markdown reference appears at the caret immediately, while the file
// uploads in the background. Possible because `post://image-N` is resolved at
// render time — the reference is valid before the bytes land.

import { type ClipboardEvent, useCallback, useState } from "react";
import { toast } from "react-hot-toast";
import { slotMarkdown } from "@/lib/blog/images";
import { isImageMime } from "@/lib/storage/paths";

/** "sunset-over-lake.png" → "sunset over lake" — a usable default alt text. */
export function altFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export interface UseImageDropInsertResult {
  /** Number of images currently uploading from the editor surface. */
  pending: number;
  /** Handle a list of dropped/selected files — non-images are ignored. */
  ingest: (files: File[] | FileList) => Promise<void>;
  /** Paste handler for the textarea; returns true when it consumed an image. */
  handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => boolean;
}

export function useImageDropInsert({
  reserveSlot,
  upload,
  insert,
  enabled = true,
}: {
  reserveSlot: () => string;
  upload: (slot: string, file: File) => Promise<string | null>;
  insert: (snippet: string) => void;
  /** False before a slug exists — dropping then would file images nowhere. */
  enabled?: boolean;
}): UseImageDropInsertResult {
  const [pending, setPending] = useState(0);

  const ingest = useCallback(
    async (input: File[] | FileList) => {
      const files = Array.from(input).filter((file) => isImageMime(file.type));
      if (files.length === 0) return;
      if (!enabled) {
        toast.error("Give the post a title first — images are filed under its slug");
        return;
      }

      for (const file of files) {
        const slot = reserveSlot();
        // Insert first: the author keeps typing while the bytes travel.
        insert(slotMarkdown(slot, altFromFileName(file.name)));
        setPending((count) => count + 1);
        void upload(slot, file).finally(() => setPending((count) => Math.max(0, count - 1)));
      }
    },
    [enabled, insert, reserveSlot, upload],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const data = event.clipboardData;
      const files = Array.from(data?.files ?? []).filter((file) => isImageMime(file.type));

      // iOS/WebKit: an image copied from Photos or the share sheet arrives in
      // clipboardData.items with kind "file" while .files stays EMPTY — the
      // desktop path above never sees it, so the paste fell through to text.
      if (files.length === 0) {
        for (const item of Array.from(data?.items ?? [])) {
          if (item.kind !== "file") continue;
          const file = item.getAsFile();
          if (file && isImageMime(file.type)) files.push(file);
        }
      }

      if (files.length === 0) return false; // plain text — let the default paste run
      event.preventDefault();
      void ingest(files);
      return true;
    },
    [ingest],
  );

  return { pending, ingest, handlePaste };
}
