// src/app/api/blog/admin/tags/route.ts
// GET — list tags; POST — create tag.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { listBlogTags, resolveBlogTags } from "../../_tags";
import { jsonError, requireAdmin } from "../_lib";

export async function GET() {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  try {
    return NextResponse.json({ ok: true, data: await listBlogTags(supabase) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tag list failed";
    return jsonError(500, "BLOG_TAGS_LIST_FAILED", message, error);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  const name = (body?.name ?? "").trim();
  if (!name) return jsonError(400, "BAD_REQUEST", "name is required");

  try {
    const [tag] = await resolveBlogTags(supabase, [name]);
    return NextResponse.json({ ok: true, data: tag });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tag create failed";
    return jsonError(500, "BLOG_TAG_CREATE_FAILED", message, error);
  }
}
