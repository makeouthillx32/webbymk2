"use client";
// lib/storage/upload.ts
// ─────────────────────────────────────────────────────────────────────────────
// Browser-side Supabase Storage operations. Every dashboard uploader should go
// through these four functions so bucket names, cache headers, slot eviction
// and public-URL construction stay identical everywhere.
//
//   uploadObject   — put a file at an explicit path
//   uploadToFolder — put a file at <folder>/<random>.<ext>
//   uploadToSlot   — put a file at <folder>/<slot>.<ext>, evicting other exts
//   listFolder / removeObjects / publicUrlFor
// ─────────────────────────────────────────────────────────────────────────────

import { createBrowserClient } from "@/utils/supabase/client";
import type { StorageBucket } from "./buckets";
import {
  assertImageFile,
  joinPath,
  randomObjectPath,
  slotFromFileName,
  slotObjectPath,
  withCacheBuster,
} from "./paths";

const DEFAULT_CACHE_CONTROL = "3600";

export interface UploadedObject {
  bucket: StorageBucket;
  /** Object path inside the bucket, e.g. `posts/my-slug/cover.webp`. */
  path: string;
  /** Public URL with no cache-buster — safe to store in the database. */
  publicUrl: string;
  /** Public URL with a cache-buster — use for immediate rendering. */
  freshUrl: string;
}

export interface StoredObject {
  name: string;
  path: string;
  publicUrl: string;
  updatedAt?: string | null;
  size?: number | null;
}

function storage(bucket: StorageBucket) {
  return createBrowserClient().storage.from(bucket);
}

/** Public URL for an object path. No network call. */
export function publicUrlFor(bucket: StorageBucket, path: string): string {
  return storage(bucket).getPublicUrl(path).data.publicUrl;
}

/** Upload to an explicit path. Throws with the Supabase message on failure. */
export async function uploadObject({
  bucket,
  path,
  file,
  upsert = false,
  cacheControl = DEFAULT_CACHE_CONTROL,
}: {
  bucket: StorageBucket;
  path: string;
  file: File | Blob;
  upsert?: boolean;
  cacheControl?: string;
}): Promise<UploadedObject> {
  const { error } = await storage(bucket).upload(path, file, {
    upsert,
    cacheControl,
    contentType: (file as File).type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);

  const publicUrl = publicUrlFor(bucket, path);
  return { bucket, path, publicUrl, freshUrl: withCacheBuster(publicUrl) };
}

/** Upload under `<folder>/<random>.<ext>` — for gallery-style images. */
export async function uploadToFolder({
  bucket,
  folder,
  file,
  validateImage = true,
}: {
  bucket: StorageBucket;
  folder: string;
  file: File;
  validateImage?: boolean;
}): Promise<UploadedObject> {
  if (validateImage) assertImageFile(file);
  return uploadObject({ bucket, path: randomObjectPath(folder, file), file });
}

/**
 * Upload into a predictable slot (`<folder>/<slot>.<ext>`), removing same-slot
 * files that carry a different extension. Without the eviction step a PNG
 * replacing a JPG leaves both on disk and the listing shows a stale image.
 */
export async function uploadToSlot({
  bucket,
  folder,
  slot,
  file,
  validateImage = true,
}: {
  bucket: StorageBucket;
  folder: string;
  slot: string;
  file: File;
  validateImage?: boolean;
}): Promise<UploadedObject> {
  if (validateImage) assertImageFile(file);

  const path = slotObjectPath(folder, slot, file);
  const stale = (await listFolder({ bucket, folder }))
    .filter((object) => slotFromFileName(object.name) === slot && object.path !== path)
    .map((object) => object.path);
  if (stale.length > 0) await removeObjects({ bucket, paths: stale });

  return uploadObject({ bucket, path, file, upsert: true });
}

/** List a folder. Returns `[]` rather than throwing when the folder is absent. */
export async function listFolder({
  bucket,
  folder,
  limit = 100,
}: {
  bucket: StorageBucket;
  folder: string;
  limit?: number;
}): Promise<StoredObject[]> {
  const { data, error } = await storage(bucket).list(folder, { limit });
  if (error || !data) return [];

  return data
    .filter((entry) => entry.name && !entry.name.startsWith("."))
    .map((entry) => {
      const path = joinPath(folder, entry.name);
      return {
        name: entry.name,
        path,
        publicUrl: publicUrlFor(bucket, path),
        updatedAt: entry.updated_at ?? null,
        size: (entry.metadata as { size?: number } | null)?.size ?? null,
      };
    });
}

export async function removeObjects({
  bucket,
  paths,
}: {
  bucket: StorageBucket;
  paths: string[];
}): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storage(bucket).remove(paths);
  if (error) throw new Error(error.message);
}

/** Remove every file whose name (minus extension) matches `slot`. */
export async function removeSlot({
  bucket,
  folder,
  slot,
}: {
  bucket: StorageBucket;
  folder: string;
  slot: string;
}): Promise<void> {
  const paths = (await listFolder({ bucket, folder }))
    .filter((object) => slotFromFileName(object.name) === slot)
    .map((object) => object.path);
  await removeObjects({ bucket, paths });
}
