// src/app/api/blog/admin/[id]/images/route.ts
// GET  — list recorded images for a post (or the unattached library).
// POST — record uploaded image metadata (file itself goes browser → storage).

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { jsonError, requireAdmin, IMAGE_SELECT } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const limit = Math.min(
    Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 60), 1),
    200,
  );

  const base = supabase
    .from("blog_post_images")
    .select(IMAGE_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data, error } =
    id === "unattached" ? await base.is("post_id", null) : await base.eq("post_id", id);

  if (error) return jsonError(500, "BLOG_IMAGES_LIST_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  if (!body?.object_path) return jsonError(400, "BAD_REQUEST", "object_path is required");

  const { data, error } = await supabase
    .from("blog_post_images")
    .insert({
      post_id:     id === "unattached" ? null : id,
      bucket_name: body.bucket_name ?? "blog-images",
      object_path: body.object_path,
      alt_text:    body.alt_text ?? null,
    })
    .select(IMAGE_SELECT)
    .single();

  if (error) return jsonError(500, "BLOG_IMAGE_INSERT_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data });
}
