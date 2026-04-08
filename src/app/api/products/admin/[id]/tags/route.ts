// app/api/products/admin/[id]/tags/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

type Params = { params: Promise<{ id: string }> }; // ✅ Promise

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  // ✅ Await params
  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const { slug, name } = body;
  if (!slug || !name) {
    return jsonError(400, "MISSING_FIELDS", "slug and name are required");
  }

  // 1. Upsert tag
  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .upsert({ slug, name }, { onConflict: "slug" })
    .select("*")
    .single();

  if (tagError) {
    return jsonError(500, "TAG_UPSERT_FAILED", tagError.message, tagError);
  }

  // 2. Link to product
  const { error: linkError } = await supabase
    .from("product_tags")
    .insert({ product_id: id, tag_id: tag.id })
    .select();

  if (linkError) {
    // Ignore duplicate key errors
    if (!linkError.message.includes("duplicate")) {
      return jsonError(500, "TAG_LINK_FAILED", linkError.message, linkError);
    }
  }

  return NextResponse.json({ ok: true, data: tag });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  // ✅ Await params
  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return jsonError(401, "UNAUTHORIZED", "Authentication required");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const { tag } = body; // Can be tag ID or slug

  if (!tag) {
    return jsonError(400, "MISSING_TAG", "tag (id or slug) is required");
  }

  // Delete from product_tags junction table
  const { error } = await supabase
    .from("product_tags")
    .delete()
    .eq("product_id", id)
    .or(`tag_id.eq.${tag},tags.slug.eq.${tag}`);

  if (error) {
    return jsonError(500, "TAG_REMOVE_FAILED", error.message, error);
  }

  return NextResponse.json({ ok: true });
}