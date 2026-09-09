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
  // The product upload modal has always requested ?include=tree and then
  // rendered `n.children` recursively. This endpoint never implemented it,
  // so the picker silently drew a flat list and hierarchy was invisible at
  // the one moment it matters — deciding where a product gets shelved.
  const wantsTree = searchParams.get("include") === "tree";

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
      updated_at,
      cover_image_bucket,
      cover_image_path,
      cover_image_alt,
      eyebrow,
      tagline,
      subtitle,
      cta_label,
      text_color_token
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

  // Resolve the cover to a public URL here rather than making every caller
  // rebuild it — the dashboard's card-overlay preview needs real artwork to be
  // worth anything.
  const rows = (data ?? []).map((c: any) => ({
    ...c,
    coverImageUrl:
      c.cover_image_bucket && c.cover_image_path
        ? supabase.storage.from(c.cover_image_bucket).getPublicUrl(c.cover_image_path).data.publicUrl
        : null,
  }));

  return NextResponse.json({
    ok: true,
    data: wantsTree ? buildTree(rows) : rows,
    meta: { limit, offset },
  });
}

/**
 * Nest a flat category list by parent_id.
 *
 * Rows whose parent is missing from THIS page of results are promoted to the
 * root rather than dropped — a paginated or filtered fetch would otherwise
 * make whole branches vanish from the picker with no indication why.
 */
function buildTree(rows: any[]): any[] {
  const byId = new Map<string, any>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });

  const roots: any[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
