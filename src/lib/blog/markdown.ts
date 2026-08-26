// lib/blog/markdown.ts
// Preview rendering for the editor. Resolves post:// slot references first so
// what the author sees matches what the blog zone will render.

import { marked } from "marked";
import type { ContentFormat } from "@/types/blog";
import { resolveSlotRefs, type SlotMap } from "./images";

export function renderPostPreview(
  source: string,
  format: ContentFormat,
  slots: SlotMap = {},
): string {
  const resolved = resolveSlotRefs(source ?? "", slots);
  if (format === "html") return resolved;
  try {
    return marked.parse(resolved, { async: false }) as string;
  } catch {
    return "";
  }
}

/** Rough reading time, matching the ~200 wpm convention used on the blog. */
export function readingTimeMinutes(source: string): number {
  const words = (source ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function wordCount(source: string): number {
  return (source ?? "").trim().split(/\s+/).filter(Boolean).length;
}
