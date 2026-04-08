import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

/**
 * GET /api/categories
 * Public category list (active)
 *
 * Query:
 * - limit
 * - offset
 * - parent (optional parent_id)
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const parent = searchParams.get("parent");

  let query = supabase
    .from("categories")
    .select(
      `
      id,
      name,
      slug,
      parent_id,
      sort_order,
      position,
      is_active,
      created_at,
      updated_at
    `
    )
    .eq("is_active", true)
    .order("position", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (parent) query = query.eq("parent_id", parent);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: "CATEGORY_LIST_FAILED", message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: data ?? [],
    meta: { limit, offset },
  });
}
