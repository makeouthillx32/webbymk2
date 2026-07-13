// src/app/api/blog/admin/[id]/images/route.ts
// POST — record uploaded image metadata (file itself goes browser → storage).

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { jsonError, requireAdmin } from "../../_lib";

type Ctx = { params: Promise<{ id: string }> };

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
    .select("id, bucket_name, object_path")
    .single();

  if (error) return jsonError(500, "BLOG_IMAGE_INSERT_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data });
}
