import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status }
  );
}

// TODO: Replace with your real role gating (admin/catalog manager)
async function requireAdmin(supabase: ReturnType<typeof createServerClient>) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  return { ok: true };
}

/**
 * GET /api/tags
 * Public tag list.
 *
 * Query:
 *  - q=search
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");

  let query = supabase
    .from("tags")
    .select("id, slug, name, created_at")
    .order("name", { ascending: true });

  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return jsonError(500, "TAG_LIST_FAILED", error.message);
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * POST /api/tags
 * Admin create tag.
 *
 * Body:
 * { "name": "Sale", "slug": "sale" }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(401, "UNAUTHORIZED", "Authentication required");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const name = body?.name;
  const slug = body?.slug;

  if (!name || typeof name !== "string") {
    return jsonError(400, "INVALID_NAME", "name is required");
  }
  if (!slug || typeof slug !== "string") {
    return jsonError(400, "INVALID_SLUG", "slug is required");
  }

  const { data, error } = await supabase
    .from("tags")
    .insert({ name, slug })
    .select()
    .single();

  if (error) {
    return jsonError(500, "TAG_CREATE_FAILED", error.message);
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * PATCH /api/tags
 * Admin update tag.
 *
 * Body:
 * { "id": "uuid", "name"?: "...", "slug"?: "..." }
 */
export async function PATCH(req: NextRequest) {
  const supabase = createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(401, "UNAUTHORIZED", "Authentication required");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const id = body?.id;
  if (!id || typeof id !== "string") {
    return jsonError(400, "INVALID_ID", "id is required");
  }

  const update: Record<string, any> = {};
  if ("name" in body) {
    if (!body.name || typeof body.name !== "string") {
      return jsonError(400, "INVALID_NAME", "name must be a non-empty string");
    }
    update.name = body.name;
  }
  if ("slug" in body) {
    if (!body.slug || typeof body.slug !== "string") {
      return jsonError(400, "INVALID_SLUG", "slug must be a non-empty string");
    }
    update.slug = body.slug;
  }

  if (Object.keys(update).length === 0) {
    return jsonError(400, "NO_FIELDS", "No updatable fields were provided");
  }

  const { data, error } = await supabase
    .from("tags")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return jsonError(500, "TAG_UPDATE_FAILED", error.message);
  }

  return NextResponse.json({ ok: true, data });
}
