// src/app/api/blog/admin/[id]/route.ts
// GET / PATCH / DELETE a single blog post.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { readTagReplaceCommand } from "../../_tags";
import { jsonError, requireAdmin, slugify, POST_SELECT } from "../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { data, error } = await supabase
    .from("blog_posts")
    .select(POST_SELECT)
    .eq("id", id)
    .single();

  if (error) return jsonError(404, "BLOG_POST_NOT_FOUND", error.message);
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "BAD_REQUEST", "JSON body required");
  const tagCommand = readTagReplaceCommand(body);
  if (tagCommand.error) return jsonError(400, "BAD_REQUEST", tagCommand.error);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.slug !== undefined)           patch.slug = slugify(body.slug);
  if (body.title !== undefined)          patch.title = body.title;
  if (body.excerpt !== undefined)        patch.excerpt = body.excerpt;
  if (body.content !== undefined)        patch.content = body.content;
  if (body.content_format !== undefined) patch.content_format = body.content_format === "html" ? "html" : "md";
  if (body.cover_image !== undefined)    patch.cover_image = body.cover_image;
  if (body.author_id !== undefined)      patch.author_id = body.author_id;
  if (body.is_published !== undefined)   patch.is_published = Boolean(body.is_published);
  if (body.published_at !== undefined)   patch.published_at = body.published_at;

  // Publishing without a date stamps now
  if (patch.is_published === true && body.published_at === undefined) {
    const { data: cur } = await supabase.from("blog_posts").select("published_at").eq("id", id).single();
    if (!cur?.published_at) patch.published_at = new Date().toISOString();
  }

  const { error } = await supabase.from("blog_posts").update(patch).eq("id", id);
  if (error) return jsonError(500, "BLOG_ADMIN_UPDATE_FAILED", error.message, error);

  // Replace tag set when provided
  if (tagCommand.tagIds) {
    const { error: delErr } = await supabase.from("blog_post_tags").delete().eq("post_id", id);
    if (delErr) return jsonError(500, "BLOG_ADMIN_TAGS_FAILED", delErr.message, delErr);
    if (tagCommand.tagIds.length > 0) {
      const rows = tagCommand.tagIds.map((tag_id) => ({ post_id: id, tag_id }));
      const { error: insErr } = await supabase.from("blog_post_tags").insert(rows);
      if (insErr) return jsonError(500, "BLOG_ADMIN_TAGS_FAILED", insErr.message, insErr);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) return jsonError(500, "BLOG_ADMIN_DELETE_FAILED", error.message, error);

  return NextResponse.json({ ok: true });
}
