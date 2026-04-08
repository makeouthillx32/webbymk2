// app/api/products/admin/[id]/categories/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = { params: Promise<{ id: string }> }; // ✅ Promise

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

// TODO: Replace with your real role gating (admin/catalog manager)
async function requireAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false, status: 401 as const, message: "Authentication required" };
  return { ok: true as const };
}

/**
 * POST /api/products/admin/[id]/categories
 * Body: { "category_id": "uuid" }
 *
 * DB facts (confirmed):
 * - product_categories has PK/unique (product_id, category_id)
 * - FK product_id -> products.id
 * - FK category_id -> categories.id
 */
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  // ✅ Await params
  const { id: product_id } = await params;
  if (!product_id) return jsonError(400, "INVALID_ID", "Missing product id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const category_id = body?.category_id;
  if (!category_id || typeof category_id !== "string") {
    return jsonError(400, "INVALID_CATEGORY_ID", "category_id is required");
  }

  // Idempotent assignment via upsert on the composite key
  const { data, error } = await supabase
    .from("product_categories")
    .upsert(
      { product_id, category_id },
      { onConflict: "product_id,category_id", ignoreDuplicates: false }
    )
    .select("*")
    .single();

  if (error) return jsonError(500, "ASSIGN_CATEGORY_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}

/**
 * DELETE /api/products/admin/[id]/categories?category_id=uuid
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  // ✅ Await params
  const { id: product_id } = await params;
  if (!product_id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { searchParams } = new URL(req.url);
  const category_id = searchParams.get("category_id");
  if (!category_id) return jsonError(400, "INVALID_CATEGORY_ID", "category_id query param is required");

  const { data, error } = await supabase
    .from("product_categories")
    .delete()
    .eq("product_id", product_id)
    .eq("category_id", category_id)
    .select("*")
    .maybeSingle();

  if (error) return jsonError(500, "UNASSIGN_CATEGORY_FAILED", error.message, error);

  if (!data) return jsonError(404, "NOT_FOUND", "Category not assigned to this product");

  return NextResponse.json({ ok: true, data });
}