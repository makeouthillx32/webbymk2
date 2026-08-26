// src/app/api/blog/admin/authors/[id]/route.ts
// PATCH / DELETE a single blog author. The dashboard byline editor writes the
// full record here — bio, avatar and social links, not just the name.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { jsonError, requireAdmin, slugify, AUTHOR_SELECT } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  if (!body) return jsonError(400, "BAD_REQUEST", "JSON body required");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return jsonError(400, "BAD_REQUEST", "name cannot be empty");
    patch.name = name;
  }
  if (body.slug !== undefined) patch.slug = slugify(body.slug);
  if (body.avatar_url !== undefined) patch.avatar_url = body.avatar_url || null;
  if (body.bio !== undefined) {
    patch.bio = { en: body.bio?.en ?? "", de: body.bio?.de ?? "" };
  }
  for (const key of ["website_url", "github_url", "bluesky_url", "x_url"] as const) {
    if (body[key] !== undefined) patch[key] = body[key] || null;
  }

  const { data, error } = await supabase
    .from("blog_authors")
    .update(patch)
    .eq("id", id)
    .select(AUTHOR_SELECT)
    .single();

  if (error) return jsonError(500, "BLOG_AUTHOR_UPDATE_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  // Posts keep their byline text; only the relation is cleared.
  await supabase.from("blog_posts").update({ author_id: null }).eq("author_id", id);

  const { error } = await supabase.from("blog_authors").delete().eq("id", id);
  if (error) return jsonError(500, "BLOG_AUTHOR_DELETE_FAILED", error.message, error);

  return NextResponse.json({ ok: true });
}
