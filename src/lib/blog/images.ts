"use client";
// lib/blog/images.ts
// ─────────────────────────────────────────────────────────────────────────────
// Post image slots. A post owns a storage folder `posts/<slug>/` holding
// predictably named files — `cover.webp`, `image-1.png`, `image-2.jpg`.
// Markdown references them as `post://image-1`, which the blog resolves at
// render time. That indirection is what lets an author write the reference
// before the file exists (and lets us replace an image without touching text).
//
// Built on lib/storage, so blog uploads behave like every other upload in the
// dashboard: same bucket constants, same eviction, same cache-busting.
// ─────────────────────────────────────────────────────────────────────────────

import {
  BLOG_IMAGE_BUCKET,
  joinPath,
  listFolder,
  removeSlot,
  slotFromFileName,
  stripCacheBuster,
  uploadToFolder,
  uploadToSlot,
  withCacheBuster,
  type UploadedObject,
} from "@/lib/storage";
import { blogAdmin } from "./client";
import {
  COVER_SLOT,
  IMAGE_SLOT_PREFIX,
  LOOSE_IMAGE_FOLDER,
  POST_IMAGE_FOLDER,
  POST_REF_SCHEME,
} from "./constants";

/** slot → public URL (cache-busted for display). */
export type SlotMap = Record<string, string>;

/** Storage folder for a post's images. */
export function postImageFolder(slug: string): string {
  return joinPath(POST_IMAGE_FOLDER, slug);
}

/** `post://image-1` */
export function slotRef(slot: string): string {
  return `${POST_REF_SCHEME}${slot}`;
}

/** Markdown snippet that embeds a slot, ready to drop at the cursor. */
export function slotMarkdown(slot: string, alt = ""): string {
  return `\n![${alt}](${slotRef(slot)})\n`;
}

export function isSlotRef(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(POST_REF_SCHEME));
}

/** `post://cover` → `cover`; anything else → null. */
export function slotFromRef(value: string | null | undefined): string | null {
  return isSlotRef(value) ? value!.slice(POST_REF_SCHEME.length) : null;
}

export function isNumberedSlot(slot: string): boolean {
  return new RegExp(`^${IMAGE_SLOT_PREFIX}\\d+$`).test(slot);
}

/** Numbered slots in ascending order. */
export function sortedImageSlots(slots: SlotMap | string[]): string[] {
  const names = Array.isArray(slots) ? slots : Object.keys(slots);
  return names
    .filter(isNumberedSlot)
    .sort((a, b) => Number(a.slice(IMAGE_SLOT_PREFIX.length)) - Number(b.slice(IMAGE_SLOT_PREFIX.length)));
}

/** First unused `image-N`, so parallel drops never collide on a name. */
export function nextImageSlot(slots: SlotMap | string[]): string {
  const used = new Set(sortedImageSlots(slots));
  let n = 1;
  while (used.has(`${IMAGE_SLOT_PREFIX}${n}`)) n += 1;
  return `${IMAGE_SLOT_PREFIX}${n}`;
}

/** List the slots that currently exist for a slug. */
export async function listPostSlots(slug: string): Promise<SlotMap> {
  if (!slug) return {};
  const objects = await listFolder({ bucket: BLOG_IMAGE_BUCKET, folder: postImageFolder(slug) });
  const map: SlotMap = {};
  for (const object of objects) {
    map[slotFromFileName(object.name)] = object.publicUrl;
  }
  return map;
}

const SLOT_API = "/api/blog/admin/slot-image";
const SLOT_UPLOAD_TIMEOUT_MS = 45_000;

/**
 * Upload a file into `posts/<slug>/<slot>.<ext>`, replacing whatever was there.
 * Returns a cache-busted URL for display and the clean URL for persistence.
 *
 * Goes through the slot-image API — cookie auth + a server-side service-role
 * write — NOT browser→storage. The browser client's access token silently
 * lapses to anon when a refresh fails (2026-07-27: pasted refs appeared but
 * files never uploaded, while cookie-authenticated saves worked the whole
 * time). Cookies are the auth path that demonstrably survives; use it.
 * The explicit timeout is so a dead gateway fails loudly instead of leaving
 * the slot tile spinning forever.
 */
export async function uploadPostSlot({
  slug,
  slot,
  file,
}: {
  slug: string;
  slot: string;
  file: File;
}): Promise<UploadedObject> {
  if (!slug) throw new Error("Give the post a title or slug first — images are filed under its slug");

  const form = new FormData();
  form.set("file", file);
  form.set("slug", slug);
  form.set("slot", slot);

  const res = await fetch(SLOT_API, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(SLOT_UPLOAD_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? `Upload failed (${res.status})`);
  }

  const publicUrl = json.data.publicUrl as string;
  return {
    bucket: BLOG_IMAGE_BUCKET,
    path: json.data.path as string,
    publicUrl,
    freshUrl: withCacheBuster(publicUrl),
  };
}

export async function removePostSlot({ slug, slot }: { slug: string; slot: string }): Promise<void> {
  if (!slug) return;
  const res = await fetch(SLOT_API, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, slot }),
    signal: AbortSignal.timeout(SLOT_UPLOAD_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error?.message ?? `Delete failed (${res.status})`);
  }
}

/**
 * Upload an image that is not tied to a slot (the loose library). Records a
 * blog_post_images row so the picker can offer it again later; a failed record
 * is non-fatal — the file itself is already usable.
 */
export async function uploadLooseImage({
  postId,
  file,
  altText = null,
}: {
  postId: string | null;
  file: File;
  altText?: string | null;
}): Promise<UploadedObject> {
  const uploaded = await uploadToFolder({
    bucket: BLOG_IMAGE_BUCKET,
    folder: postId ? joinPath(POST_IMAGE_FOLDER, postId) : LOOSE_IMAGE_FOLDER,
    file,
  });

  await blogAdmin
    .recordImage(postId, {
      bucket_name: BLOG_IMAGE_BUCKET,
      object_path: uploaded.path,
      alt_text: altText,
    })
    .catch(() => null);

  return uploaded;
}

/** Rewrite every `post://<slot>` in a string to its public URL, where known. */
export function resolveSlotRefs(source: string, slots: SlotMap): string {
  return source.replace(/post:\/\/([\w][\w.-]*)/g, (whole, slot: string) => slots[slot] ?? whole);
}

/** Public URL to render for `cover_image`, which may be a slot ref or a URL. */
export function resolveCoverUrl(coverImage: string | null, slots: SlotMap): string | null {
  if (!coverImage) return null;
  const slot = slotFromRef(coverImage);
  if (slot) return slots[slot] ?? null;
  return coverImage;
}

// Re-exported for convenience; COVER_SLOT stays in ./constants so the barrel
// has a single owner for each name (star re-exports drop ambiguous ones).
export { stripCacheBuster, withCacheBuster };
