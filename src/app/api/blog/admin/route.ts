// src/app/api/blog/admin/route.ts
// GET  /api/blog/admin       — admin list (any status)
// POST /api/blog/admin       — create post

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { readTagReplaceCommand } from "../_tags";
import { jsonError, requireAdmin, slugify, POST_SELECT } from "./_lib";

export async function GET(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { searchParams } = new URL(req.url);
  const limit  = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  const status = (searchParams.get("status") ?? "all").toLowerCase(); // all | published | draft
  const q      = (searchParams.get("q") ?? "").trim();

  let query = supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at",   { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "published") query = query.eq("is_published", true);
  if (status === "draft")     query = query.eq("is_published", false);
  if (q) query = query.or(`slug.ilike.%${q}%,title->>en.ilike.%${q}%,title->>de.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return jsonError(500, "BLOG_ADMIN_LIST_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  if (!body?.title?.en) return jsonError(400, "BAD_REQUEST", "title.en is required");
  const tagCommand = readTagReplaceCommand(body);
  if (tagCommand.error) return jsonError(400, "BAD_REQUEST", tagCommand.error);

  const slug = slugify(body.slug || body.title.en);
  if (!slug) return jsonError(400, "BAD_REQUEST", "slug could not be derived");

  const insert = {
    slug,
    title:          { en: body.title.en ?? "", de: body.title.de ?? "" },
    excerpt:        { en: body.excerpt?.en ?? "", de: body.excerpt?.de ?? "" },
    content:        { en: body.content?.en ?? "", de: body.content?.de ?? "" },
    content_format: body.content_format === "html" ? "html" : "md",
    cover_image:    body.cover_image ?? null,
    author_id:      body.author_id ?? null,
    is_published:   Boolean(body.is_published),
    published_at:   body.is_published ? (body.published_at ?? new Date().toISOString()) : (body.published_at ?? null),
  };

  const { data, error } = await supabase
    .from("blog_posts")
    .insert(insert)
    .select("id, slug")
    .single();

  if (error) return jsonError(500, "BLOG_ADMIN_CREATE_FAILED", error.message, error);

  // Attach tags if provided
  if (tagCommand.tagIds && tagCommand.tagIds.length > 0) {
    const rows = tagCommand.tagIds.map((tag_id) => ({ post_id: data.id, tag_id }));
    const { error: tagErr } = await supabase.from("blog_post_tags").insert(rows);
    if (tagErr) return jsonError(500, "BLOG_ADMIN_TAGS_FAILED", tagErr.message, tagErr);
  }

  return NextResponse.json({ ok: true, data });
}
