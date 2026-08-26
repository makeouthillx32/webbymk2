// src/app/api/blog/ingest/images/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Standalone image upload for the two-step ingest flow: upload pictures first,
// get public URLs back, then reference those URLs directly in the post payload.
//
// Auth:   Authorization: Bearer <BLOG_INGEST_TOKEN>
// Accepts EITHER:
//   • multipart/form-data — one or more `files` fields (what a Discord bot
//     forwards straight from message attachments)
//   • application/json    — { "images": [{ "name", "data" (base64), "content_type"?, "alt"? }] }
// Returns: { ok: true, data: { images: { "<name>": "<public url>", ... } } }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 10;

function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

const JsonSchema = z.object({
  images: z
    .array(
      z.object({
        name:         z.string().regex(/^[\w][\w.-]*$/).max(80),
        data:         z.string().min(1),
        content_type: z.string().regex(/^image\//).optional(),
        alt:          z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(MAX_IMAGES),
});

function extFromType(ct: string | undefined, name: string): string {
  if (ct?.includes("png")) return "png";
  if (ct?.includes("gif")) return "gif";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("svg")) return "svg";
  const i = name.lastIndexOf(".");
  if (i >= 0) return name.slice(i + 1).toLowerCase();
  return "jpg";
}

export async function POST(req: NextRequest) {
  // ── Auth (same scheme as /api/blog/ingest) ────────────────────────────────
  const token = process.env.BLOG_INGEST_TOKEN;
  if (!token) return fail(401, "UNAUTHORIZED", "BLOG_INGEST_TOKEN is not configured on the server");
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented || presented.length !== token.length) return fail(401, "UNAUTHORIZED", "Invalid token");
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ presented.charCodeAt(i);
  if (mismatch !== 0) return fail(401, "UNAUTHORIZED", "Invalid token");

  // ── Collect images from either content type ──────────────────────────────
  const items: { name: string; buf: Buffer; contentType: string; alt: string | null }[] = [];
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "BAD_REQUEST", "Unreadable multipart body");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0)         return fail(422, "VALIDATION_FAILED", "No `files` fields in form data");
    if (files.length > MAX_IMAGES)  return fail(422, "VALIDATION_FAILED", `Max ${MAX_IMAGES} images per request`);
    for (const f of files) {
      if (!f.type.startsWith("image/")) return fail(422, "VALIDATION_FAILED", `${f.name}: not an image (${f.type || "unknown type"})`);
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) return fail(413, "IMAGE_TOO_LARGE", `${f.name}: exceeds ${MAX_IMAGE_BYTES} bytes`);
      items.push({ name: f.name.replace(/[^\w.-]/g, "_"), buf, contentType: f.type, alt: null });
    }
  } else {
    const raw = await req.json().catch(() => null);
    const parsed = JsonSchema.safeParse(raw);
    if (!parsed.success) return fail(422, "VALIDATION_FAILED", "Payload rejected", parsed.error.flatten());
    for (const img of parsed.data.images) {
      const b64 = img.data.replace(/^data:image\/[a-z+.-]+;base64,/, "");
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 0)             return fail(422, "VALIDATION_FAILED", `${img.name}: empty after decode`);
      if (buf.length > MAX_IMAGE_BYTES) return fail(413, "IMAGE_TOO_LARGE", `${img.name}: exceeds ${MAX_IMAGE_BYTES} bytes`);
      items.push({ name: img.name, buf, contentType: img.content_type ?? "image/jpeg", alt: img.alt ?? null });
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  const supabase = createAdminClient();
  const urls: Record<string, string> = {};

  for (const item of items) {
    const object_path = `ingest/unattached/${Date.now().toString(16)}-${item.name}.${extFromType(item.contentType, item.name)}`;
    const { error } = await supabase.storage.from("blog-images").upload(object_path, item.buf, {
      upsert: true,
      cacheControl: "3600",
      contentType: item.contentType,
    });
    if (error) return fail(500, "IMAGE_UPLOAD_FAILED", `${item.name}: ${error.message}`);

    const { data } = supabase.storage.from("blog-images").getPublicUrl(object_path);
    urls[item.name] = data.publicUrl;

    await supabase.from("blog_post_images").insert({
      post_id: null,
      bucket_name: "blog-images",
      object_path,
      alt_text: item.alt,
    });
  }

  return NextResponse.json({ ok: true, data: { images: urls } });
}
