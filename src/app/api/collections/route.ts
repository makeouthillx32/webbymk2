// app/api/collections/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

/**
 * GET /api/collections
 * Public collections list
 *
 * Query params:
 * - limit (number, optional, default 50)
 * - offset (number, optional, default 0)
 * - q (string, optional) - search query
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const q = searchParams.get("q");

  let query = supabase
    .from("collections")
    .select(
      `
      id,
      name,
      slug,
      description,
      position,
      is_home_section
    `
    )
    .order("position", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  // Optional search
  if (q) {
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "COLLECTION_LIST_FAILED", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: data ?? [],
    meta: { limit, offset },
  });
}