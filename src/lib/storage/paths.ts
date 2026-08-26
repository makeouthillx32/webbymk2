// lib/storage/paths.ts
// ─────────────────────────────────────────────────────────────────────────────
// Pure storage helpers — no Supabase import, so browser components, route
// handlers and the ingest agent can all share the same path and validation
// rules. If a file name is built anywhere other than here, it will drift.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // matches the ingest API cap

const MIME_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

/** File extension for a blob, preferring its MIME type over its name. */
export function extensionFor(input: { name?: string; type?: string }): string {
  const byMime = MIME_EXTENSION[(input.type ?? "").toLowerCase()];
  if (byMime) return byMime;

  const name = input.name ?? "";
  const dot = name.lastIndexOf(".");
  const byName = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,5}$/.test(byName) ? byName : "jpg";
}

/** Collision-resistant object id — timestamp keeps listings roughly ordered. */
export function randomObjectId(): string {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Strip characters Supabase Storage dislikes in a single path segment, rejecting "undefined" and "null". */
export function safeSegment(value: string | null | undefined): string {
  const str = String(value ?? "");
  if (!str || str === "undefined" || str === "null") return "";
  return str
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

/** Join path segments with single slashes, stripping out leading/trailing slashes and accidental "undefined" / "null" segments. */
export function joinPath(...segments: (string | null | undefined)[]): string {
  return segments
    .filter((segment): segment is string => Boolean(segment) && segment !== "undefined" && segment !== "null")
    .map((segment) =>
      segment
        .replace(/^\/+|\/+$/g, "")
        .replace(/^(?:undefined|null)\/+/g, "")
        .replace(/\/+(?:undefined|null)(?=\/|$)/g, "")
    )
    .filter((segment) => Boolean(segment) && segment !== "undefined" && segment !== "null")
    .join("/");
}

/** `<folder>/<random>.<ext>` — for images with no fixed identity. */
export function randomObjectPath(folder: string, file: { name?: string; type?: string }): string {
  return joinPath(folder, `${randomObjectId()}.${extensionFor(file)}`);
}

/** `<folder>/<slot>.<ext>` — for predictable, replaceable slots (cover, image-1…). */
export function slotObjectPath(
  folder: string,
  slot: string,
  file: { name?: string; type?: string },
): string {
  return joinPath(folder, `${safeSegment(slot)}.${extensionFor(file)}`);
}

/** Slot name for a stored file name (`image-2.webp` → `image-2`). */
export function slotFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function isImageMime(type: string | undefined | null): boolean {
  return Boolean(type && type.startsWith("image/"));
}

/**
 * Throws a human-readable Error when a file is not an acceptable image.
 * Callers surface `error.message` straight to a toast.
 */
export function assertImageFile(
  file: { name?: string; type?: string; size?: number },
  maxBytes: number = MAX_IMAGE_BYTES,
): void {
  if (!isImageMime(file.type)) {
    throw new Error(`${file.name ?? "That file"} is not an image`);
  }
  if (typeof file.size === "number" && file.size > maxBytes) {
    throw new Error(
      `${file.name ?? "That image"} is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)}`,
    );
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Append a cache-buster so a replaced object at the same path re-renders. */
export function withCacheBuster(url: string, token: string | number = Date.now()): string {
  return `${url}${url.includes("?") ? "&" : "?"}v=${token}`;
}

/** Drop a cache-buster before persisting a URL to the database. */
export function stripCacheBuster(url: string): string {
  return url.split("?")[0];
}
