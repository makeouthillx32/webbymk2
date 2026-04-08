import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/products/admin
 * Admin product listing (draft + active + archived)
 * Query:
 *  - q
 *  - status=draft|active|archived|all (default all)
 *  - limit, offset
 */
export async function GET(req: NextRequest) {
  const supabase = createServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return jsonError(401, "UNAUTHORIZED", "Authentication required");

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const status = searchParams.get("status") ?? "all";
  const limit = Number(searchParams.get("limit") ?? 50);
  const offset = Number(searchParams.get("offset") ?? 0);

  let query = supabase
    .from("products")
    .select(
      `
      id,
      slug,
      title,
      description,
      price_cents,
      compare_at_price_cents,
      currency,
      badge,
      is_featured,
      status,
      created_at,
      updated_at,
      product_images (
        id,
        storage_path,
        alt,
        position
      )
    `
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("search_text", `%${q}%`);

  const { data, error } = await query;
  if (error) return jsonError(500, "ADMIN_PRODUCT_LIST_FAILED", error.message);

  return NextResponse.json({
    ok: true,
    data: data ?? [],
    meta: { limit, offset, status },
  });
}
