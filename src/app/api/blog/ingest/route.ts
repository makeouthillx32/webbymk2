// src/app/api/blog/ingest/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Programmatic blog posting — the endpoint an MCP server, Discord bot, or any
// authorized agent calls to create or update posts in ONE request.
//
// Auth:      Authorization: Bearer <BLOG_INGEST_TOKEN>   (server env, rotatable)
// Payload:   strictly validated with zod — nothing unvalidated reaches the DB.
// Images:    send base64 attachments in `images[]`, reference them in markdown
//            (and cover_image) as `attachment://<name>` — the server uploads
//            them to the public blog-images bucket and rewrites the URLs.
// Behavior:  upsert by slug; tags and author created on the fly by name;
//            content is markdown (content_format = "md").
//
// Full payload reference: docs/blog-ingest-api.md
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { listBlogTags, resolveBlogTags, type ResolvedBlogTag } from "../_tags";
import { slugify } from "../admin/_lib";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB decoded, per image

const localized = z.object({
  en: z.string(),
  de: z.string().optional().default(""),
});

const ImageAttachment = z.object({
  /** Reference name — use attachment://<name> in markdown / cover_image. */
  name:         z.string().regex(/^[\w][\w.-]*$/, "letters, digits, dot, dash, underscore").max(80),
  /** Base64 image data. A data:image/...;base64, prefix is allowed and stripped. */
  data:         z.string().min(1),
  content_type: z.string().regex(/^image\//).optional(),
  alt:          z.string().max(200).optional(),
});

// Single-image upload — add or replace one slot on a post (existing or not
// yet created) without resending title/content/tags/etc. Lets an agent stage
// images under a slug first (cover, image-1, image-2, …) and reference them
// with post://<slot> in a post.upsert that comes later, or drop a new image
// into an already-published post without touching a word of its body.
const ImageUploadSchema = z.object({
  command:      z.literal("image.upload"),
  slug:         z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits, dashes").max(96),
  slot:         z.string().regex(/^[\w][\w.-]*$/, "letters, digits, dot, dash, underscore").max(80),
  data:         z.string().min(1),
  content_type: z.string().regex(/^image\//).optional(),
  alt:          z.string().max(200).optional(),
}).strict();

const TagName = z.string().trim().min(1).max(60);
const TagCommandSchema = z.discriminatedUnion("command", [
  z.object({ command: z.literal("tags.list") }).strict(),
  z.object({
    command: z.literal("tags.resolve"),
    tags: z.array(TagName).min(1).max(50),
  }).strict(),
]);

const IngestSchema = z.object({
  command:      z.literal("post.upsert").optional(),
  slug:         z.string().regex(/^[a-z0-9-]*$/).max(96).optional(),
  title:        localized.refine((t) => t.en.trim().length > 0, "title.en must not be empty"),
  excerpt:      localized.optional(),
  content:      localized.refine((c) => c.en.trim().length > 0, "content.en must not be empty"),
  /** https URL, or attachment://<name> referencing an entry in images[]. */
  cover_image:  z.string().max(500).nullable().optional(),
  author:       z.string().min(1).max(120).optional(),
  tags:         z.array(TagName).max(12).optional().default([]),
  images:       z.array(ImageAttachment).max(10).optional().default([]),
  publish:      z.boolean().optional().default(false),
  published_at: z.string().datetime({ offset: true }).optional(),
});

function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

function extFromType(ct: string | undefined, name: string): string {
  if (ct?.includes("png")) return "png";
  if (ct?.includes("gif")) return "gif";
  if (ct?.includes("webp")) return "webp";
  if (ct?.includes("svg")) return "svg";
  const i = name.lastIndexOf(".");
  if (i >= 0) return name.slice(i + 1).toLowerCase();
  return "jpg";
}

/** Thrown by uploadImageToSlot; callers translate it straight to fail(). */
class IngestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Decode + write one base64 image to posts/<slug>/<slot>.<ext>, evicting any
 * stale same-slot file left over from a different extension. Shared by
 * post.upsert's attachments[] loop and the standalone image.upload command —
 * one upload path, so both ever produce the same storage layout.
 */
async function uploadImageToSlot(opts: {
  supabase: ReturnType<typeof createAdminClient>;
  slug: string;
  slot: string;
  data: string;
  contentType?: string;
}): Promise<{ path: string; publicUrl: string }> {
  const b64 = opts.data.replace(/^data:image\/[a-z+.-]+;base64,/, "");
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    throw new IngestError(422, "VALIDATION_FAILED", `${opts.slot}: invalid base64`);
  }
  if (buf.length === 0) throw new IngestError(422, "VALIDATION_FAILED", `${opts.slot}: empty after decode`);
  if (buf.length > MAX_IMAGE_BYTES) {
    throw new IngestError(413, "IMAGE_TOO_LARGE", `${opts.slot}: ${buf.length} bytes exceeds ${MAX_IMAGE_BYTES}`);
  }

  const cleanSlot = opts.slot.replace(/[^\w.-]/g, "");
  const folder = `posts/${opts.slug}`;
  const object_path = `${folder}/${cleanSlot}.${extFromType(opts.contentType, opts.slot)}`;

  // Evict same-slot files with a different extension so one slot = one file.
  const { data: existing } = await opts.supabase.storage.from("blog-images").list(folder, { limit: 100 });
  const stale = (existing ?? [])
    .filter((f) => f.name.replace(/\.[^.]+$/, "") === cleanSlot && `${folder}/${f.name}` !== object_path)
    .map((f) => `${folder}/${f.name}`);
  if (stale.length > 0) await opts.supabase.storage.from("blog-images").remove(stale);

  const { error: upErr } = await opts.supabase.storage
    .from("blog-images")
    .upload(object_path, buf, {
      upsert: true,
      cacheControl: "3600",
      contentType: opts.contentType ?? "image/jpeg",
    });
  if (upErr) throw new IngestError(500, "IMAGE_UPLOAD_FAILED", `${opts.slot}: ${upErr.message}`);

  const { data } = opts.supabase.storage.from("blog-images").getPublicUrl(object_path);
  return { path: object_path, publicUrl: data.publicUrl };
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = process.env.BLOG_INGEST_TOKEN;
  if (!token) return fail(401, "UNAUTHORIZED", "BLOG_INGEST_TOKEN is not configured on the server");

  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented || presented.length !== token.length) return fail(401, "UNAUTHORIZED", "Invalid token");
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) mismatch |= token.charCodeAt(i) ^ presented.charCodeAt(i);
  if (mismatch !== 0) return fail(401, "UNAUTHORIZED", "Invalid token");

  // ── Validate ──────────────────────────────────────────────────────────────
  const raw = await req.json().catch(() => null);
  const commandName = raw && typeof raw === "object" ? (raw as { command?: unknown }).command : undefined;

  if (typeof commandName === "string" && commandName.startsWith("tags.")) {
    const command = TagCommandSchema.safeParse(raw);
    if (!command.success) {
      return fail(422, "VALIDATION_FAILED", "Command payload rejected", command.error.flatten());
    }

    const supabase = createAdminClient();
    try {
      if (command.data.command === "tags.list") {
        return NextResponse.json({
          ok: true,
          data: { command: command.data.command, tags: await listBlogTags(supabase) },
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          command: command.data.command,
          tags: await resolveBlogTags(supabase, command.data.tags),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tag command failed";
      const invalid = message.startsWith("Invalid tag name:");
      return fail(invalid ? 422 : 500, invalid ? "VALIDATION_FAILED" : "TAGS_FAILED", message);
    }
  }

  if (commandName === "image.upload") {
    const command = ImageUploadSchema.safeParse(raw);
    if (!command.success) {
      return fail(422, "VALIDATION_FAILED", "Command payload rejected", command.error.flatten());
    }
    const { slug, slot, data, content_type, alt } = command.data;
    const supabase = createAdminClient();
    try {
      const uploaded = await uploadImageToSlot({ supabase, slug, slot, data, contentType: content_type });

      // Best-effort: if a post already exists at this slug, record the image
      // and let it show up in the dashboard's library too. If not — this is
      // a pre-stage upload, fine, a post.upsert referencing post://<slot>
      // later will find the file already sitting in posts/<slug>/.
      const { data: post } = await supabase.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
      if (post?.id) {
        await supabase.from("blog_post_images").insert({
          post_id: post.id,
          bucket_name: "blog-images",
          object_path: uploaded.path,
          alt_text: alt ?? null,
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          command: "image.upload",
          slug,
          slot,
          ref: `post://${slot}`,
          url: uploaded.publicUrl,
          linked_post: Boolean(post?.id),
        },
      });
    } catch (error) {
      if (error instanceof IngestError) return fail(error.status, error.code, error.message);
      const message = error instanceof Error ? error.message : "Image upload failed";
      return fail(500, "IMAGE_UPLOAD_FAILED", message);
    }
  }

  const parsed = IngestSchema.safeParse(raw);
  if (!parsed.success) {
    return fail(422, "VALIDATION_FAILED", "Payload rejected", parsed.error.flatten());
  }
  const body = parsed.data;
  const tagsProvided = Boolean(
    raw && typeof raw === "object" && Object.prototype.hasOwnProperty.call(raw, "tags"),
  );

  // cover_image must be an https URL, attachment://<name>, or post://<slot>
  if (
    body.cover_image &&
    !body.cover_image.startsWith("attachment://") &&
    !body.cover_image.startsWith("post://")
  ) {
    const url = z.string().url().safeParse(body.cover_image);
    if (!url.success) return fail(422, "VALIDATION_FAILED", "cover_image must be a URL, attachment://<name>, or post://<slot>");
  }

  // every attachment:// reference must exist in images[]
  const imageNames = new Set(body.images.map((i) => i.name));
  const referenced = new Set<string>();
  const refPattern = /attachment:\/\/([\w][\w.-]*)/g;
  for (const text of [body.content.en, body.content.de ?? "", body.cover_image ?? ""]) {
    for (const m of text.matchAll(refPattern)) referenced.add(m[1]);
  }
  const missing = [...referenced].filter((n) => !imageNames.has(n));
  if (missing.length > 0) {
    return fail(422, "VALIDATION_FAILED", `attachment:// references not found in images[]: ${missing.join(", ")}`);
  }

  const supabase = createAdminClient();
  const slug = body.slug || slugify(body.title.en);

  // ── Upload attachments ────────────────────────────────────────────────────
  // Shared with the standalone image.upload command — one upload path, so a
  // post.upsert's images[] and a later solo image.upload against the same
  // slot always produce the identical storage layout.
  const urlMap = new Map<string, string>(); // name → public URL
  const pathMap = new Map<string, string>(); // name → storage object path
  for (const img of body.images) {
    try {
      const uploaded = await uploadImageToSlot({
        supabase,
        slug,
        slot: img.name,
        data: img.data,
        contentType: img.content_type,
      });
      urlMap.set(img.name, uploaded.publicUrl);
      pathMap.set(img.name, uploaded.path);
    } catch (error) {
      if (error instanceof IngestError) return fail(error.status, error.code, `images.${img.name}: ${error.message}`);
      throw error;
    }
  }

  // ── Resolve post://<slot> references ──────────────────────────────────────
  // Slots covered by this request's attachments resolve from urlMap; slots
  // uploaded earlier (dashboard, previous ingest) resolve from storage.
  const postRefPattern = /post:\/\/([\w][\w.-]*)/g;
  const postRefs = new Set<string>();
  for (const text of [body.content.en, body.content.de ?? "", body.cover_image ?? ""]) {
    for (const m of text.matchAll(postRefPattern)) postRefs.add(m[1]);
  }
  const unresolved = [...postRefs].filter((n) => !urlMap.has(n));
  if (unresolved.length > 0) {
    const { data: existing } = await supabase.storage.from("blog-images").list(`posts/${slug}`, { limit: 100 });
    for (const f of existing ?? []) {
      const slot = f.name.replace(/\.[^.]+$/, "");
      if (unresolved.includes(slot) && !urlMap.has(slot)) {
        const { data } = supabase.storage.from("blog-images").getPublicUrl(`posts/${slug}/${f.name}`);
        urlMap.set(slot, data.publicUrl);
      }
    }
  }
  const stillMissing = [...postRefs].filter((n) => !urlMap.has(n));
  if (stillMissing.length > 0) {
    return fail(422, "VALIDATION_FAILED", `post:// slots not found in images[] or posts/${slug}/ storage: ${stillMissing.join(", ")}`);
  }

  // ── Normalize references to DURABLE SLOT REFS ─────────────────────────────
  // Store post://<slot> in the DB, NOT absolute URLs. Attachments were uploaded
  // to the predictable slot path posts/<slug>/<name>.<ext>, so attachment://<name>
  // IS post://<name>. The renderer resolves post:// at READ time, which (a) picks
  // the browser-safe storage host (never the internal kong:8000 URL that
  // getPublicUrl returns server-side) and (b) survives later image replacement.
  const rewrite = (text: string) =>
    text
      .replace(refPattern, (_, name: string) => `post://${name}`)
      .replace(postRefPattern, (_, name: string) => `post://${name}`);

  const contentEn = rewrite(body.content.en);
  const contentDe = rewrite(body.content.de ?? "");
  const coverImage = body.cover_image ? rewrite(body.cover_image) : null;

  // ── Author (find or create by name) ───────────────────────────────────────
  let author_id: string | null = null;
  if (body.author) {
    const { data: author, error: authorErr } = await supabase
      .from("blog_authors")
      .upsert({ slug: slugify(body.author), name: body.author }, { onConflict: "slug", ignoreDuplicates: false })
      .select("id")
      .single();
    if (authorErr) return fail(500, "AUTHOR_FAILED", authorErr.message);
    author_id = author.id;
  }

  // ── Post (upsert by slug) ─────────────────────────────────────────────────
  const post = {
    slug,
    title:          { en: body.title.en, de: body.title.de ?? "" },
    excerpt:        { en: body.excerpt?.en ?? "", de: body.excerpt?.de ?? "" },
    content:        { en: contentEn, de: contentDe },
    content_format: "md",
    cover_image:    coverImage,
    ...(author_id ? { author_id } : {}),
    is_published:   body.publish,
    ...(body.publish ? { published_at: body.published_at ?? new Date().toISOString() } : {}),
    updated_at:     new Date().toISOString(),
  };

  const { data: saved, error: postErr } = await supabase
    .from("blog_posts")
    .upsert(post, { onConflict: "slug" })
    .select("id, slug")
    .single();
  if (postErr) return fail(500, "POST_FAILED", postErr.message);

  // ── Image metadata rows (non-fatal) ───────────────────────────────────────
  if (pathMap.size > 0) {
    const metaRows = body.images
      .filter((img) => pathMap.has(img.name))
      .map((img) => ({
        post_id:     saved.id,
        bucket_name: "blog-images",
        object_path: pathMap.get(img.name)!,
        alt_text:    img.alt ?? null,
      }));
    await supabase.from("blog_post_images").insert(metaRows);
  }

  // ── Tags (find or create by name, replace set when explicitly provided) ──
  let resolvedTags: ResolvedBlogTag[] | undefined;
  if (tagsProvided) {
    try {
      resolvedTags = await resolveBlogTags(supabase, body.tags);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tag resolution failed";
      return fail(500, "TAGS_FAILED", message);
    }

    const { error: deleteError } = await supabase
      .from("blog_post_tags")
      .delete()
      .eq("post_id", saved.id);
    if (deleteError) return fail(500, "TAGS_FAILED", deleteError.message);

    if (resolvedTags.length > 0) {
      const { error: joinError } = await supabase
        .from("blog_post_tags")
        .insert(resolvedTags.map((tag) => ({ post_id: saved.id, tag_id: tag.id })));
      if (joinError) return fail(500, "TAGS_FAILED", joinError.message);
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      command: "post.upsert",
      id: saved.id,
      slug: saved.slug,
      url: `https://blog.unenter.live/${saved.slug}`,
      published: body.publish,
      ...(resolvedTags ? { tags: resolvedTags } : {}),
      images: Object.fromEntries(urlMap),
    },
  });
}
