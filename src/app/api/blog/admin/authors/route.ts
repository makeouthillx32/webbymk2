// src/app/api/blog/admin/authors/route.ts
// GET — list authors; POST — create author.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import { jsonError, requireAdmin, slugify } from "../_lib";

export async function GET() {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { data, error } = await supabase
    .from("blog_authors")
    .select("id, slug, name, avatar_url, bio, website_url, github_url, bluesky_url, x_url")
    .order("name");

  if (error) return jsonError(500, "BLOG_AUTHORS_LIST_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const body = await req.json().catch(() => null);
  const name = (body?.name ?? "").trim();
  if (!name) return jsonError(400, "BAD_REQUEST", "name is required");

  const { data, error } = await supabase
    .from("blog_authors")
    .insert({
      slug:        slugify(body.slug || name),
      name,
      avatar_url:  body.avatar_url ?? null,
      bio:         { en: body.bio?.en ?? "", de: body.bio?.de ?? "" },
      website_url: body.website_url ?? null,
      github_url:  body.github_url ?? null,
      bluesky_url: body.bluesky_url ?? null,
      x_url:       body.x_url ?? null,
    })
    .select("id, slug, name")
    .single();

  if (error) return jsonError(500, "BLOG_AUTHOR_CREATE_FAILED", error.message, error);
  return NextResponse.json({ ok: true, data });
}
