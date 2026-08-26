// src/app/api/blog/admin/slot-image/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST   — upload an image into a predictable slot: posts/<slug>/<slot>.<ext>
// DELETE — remove every file for a slot (all extension variants)
//
// Why this exists (2026-07-27): slot uploads used to go browser → storage with
// the browser client's access token. That token silently lapses to anon (the
// kong stale-socket incident made refreshes hang), and then storage RLS
// rejects the write — while the editor's SAVES kept working fine, because API
// routes authenticate with cookies. Result: pasted refs appeared in the text
// but files never landed. Same request, two different auth systems, one of
// them flaky.
//
// So uploads now ride the path that provably works: cookie-authenticated
// admin gate here, then a service-role storage write (no RLS dependency).
// The browser never needs a live storage token again.
//
// Mirrors lib/storage/upload.ts uploadToSlot semantics exactly — including
// evicting same-slot files with other extensions — using the same pure
// helpers from lib/storage/paths.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { jsonError, requireAdmin } from "../_lib";
import { slugify } from "@/utils/slug";
import { BLOG_IMAGE_BUCKET } from "@/lib/storage/buckets";
import {
  MAX_IMAGE_BYTES,
  formatBytes,
  isImageMime,
  joinPath,
  safeSegment,
  slotFromFileName,
  slotObjectPath,
} from "@/lib/storage/paths";
import { supabasePublicUrlFromImage } from "@/lib/images";

export const runtime = "nodejs";

function slotPaths(existing: { name: string }[] | null, folder: string, slot: string): string[] {
  return (existing ?? [])
    .filter((entry) => slotFromFileName(entry.name) === slot)
    .map((entry) => joinPath(folder, entry.name));
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError(400, "BAD_REQUEST", "multipart/form-data body required");

  const file = form.get("file");
  const slug = slugify(String(form.get("slug") ?? ""));
  const slot = safeSegment(String(form.get("slot") ?? ""));

  if (!(file instanceof File)) return jsonError(422, "VALIDATION_FAILED", "a `file` field is required");
  if (!slug) return jsonError(422, "VALIDATION_FAILED", "a `slug` field is required");
  if (!slot) return jsonError(422, "VALIDATION_FAILED", "a `slot` field is required");
  if (!isImageMime(file.type)) {
    return jsonError(422, "VALIDATION_FAILED", `${file.name || "that file"} is not an image`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError(
      413,
      "IMAGE_TOO_LARGE",
      `${file.name || "image"} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}`,
    );
  }

  const folder = joinPath("posts", slug);
  const object_path = slotObjectPath(folder, slot, file);
  const admin = createAdminClient();
  const storage = admin.storage.from(BLOG_IMAGE_BUCKET);

  // Evict same-slot files carrying a different extension — without this, a PNG
  // replacing a JPG leaves both on disk and listings show the stale image.
  const { data: existing } = await storage.list(folder, { limit: 100 });
  const stale = slotPaths(existing, folder, slot).filter((path) => path !== object_path);
  if (stale.length > 0) await storage.remove(stale);

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await storage.upload(object_path, bytes, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type,
  });
  if (error) return jsonError(500, "SLOT_UPLOAD_FAILED", error.message, error);

  // Browser-safe URL. The admin client's getPublicUrl() returns the INTERNAL
  // split-horizon host (kong:8000) which browsers cannot reach — the classic
  // trap. supabasePublicUrlFromImage prefers NEXT_PUBLIC_SUPABASE_URL_BROWSER.
  const publicUrl = supabasePublicUrlFromImage({
    bucket_name: BLOG_IMAGE_BUCKET,
    object_path,
  });
  if (!publicUrl) return jsonError(500, "URL_RESOLUTION_FAILED", "could not build a public URL");

  return NextResponse.json({ ok: true, data: { path: object_path, publicUrl } });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  const slug = slugify(String(body?.slug ?? ""));
  const slot = safeSegment(String(body?.slot ?? ""));
  if (!slug || !slot) return jsonError(422, "VALIDATION_FAILED", "`slug` and `slot` are required");

  const folder = joinPath("posts", slug);
  const admin = createAdminClient();
  const storage = admin.storage.from(BLOG_IMAGE_BUCKET);

  const { data: existing } = await storage.list(folder, { limit: 100 });
  const paths = slotPaths(existing, folder, slot);
  if (paths.length > 0) {
    const { error } = await storage.remove(paths);
    if (error) return jsonError(500, "SLOT_DELETE_FAILED", error.message, error);
  }

  return NextResponse.json({ ok: true, data: { removed: paths.length } });
}
