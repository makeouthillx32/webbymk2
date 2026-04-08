import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = {
  params: { id: string; imageId: string };
};

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
 * PATCH /api/products/admin/[id]/images/[imageId]
 * Body supports partial:
 * {
 *   "alt": "New alt" | null,
 *   "position": 2
 * }
 *
 * DB-confirmed columns:
 * - alt_text
 * - position
 * - sort_order
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId, imageId } = await params;

  if (!productId) return jsonError(400, "INVALID_ID", "Missing product id");
  if (!imageId) return jsonError(400, "INVALID_IMAGE_ID", "Missing image id");

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const update: Record<string, any> = {};

  // alt -> alt_text
  if ("alt" in (body ?? {})) {
    const alt = body.alt;
    if (alt !== null && typeof alt !== "string") {
      return jsonError(400, "INVALID_ALT", "alt must be a string or null");
    }
    update.alt_text = alt;
  }

  // position -> keep position + sort_order in sync (matches your current data)
  if ("position" in (body ?? {})) {
    const pos = body.position;
    if (typeof pos !== "number" || !Number.isFinite(pos) || pos < 0) {
      return jsonError(400, "INVALID_POSITION", "position must be a number >= 0");
    }
    update.position = pos;
    update.sort_order = pos;
  }

  if (Object.keys(update).length === 0) {
    return jsonError(400, "NO_FIELDS", "No updatable fields were provided");
  }

  // Scoped update (ownership enforced)
  const { data, error } = await supabase
    .from("product_images")
    .update(update)
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(
      status,
      status === 404 ? "NOT_FOUND" : "IMAGE_UPDATE_FAILED",
      status === 404 ? "Image not found for this product" : error.message,
      error
    );
  }

  return NextResponse.json({ ok: true, data });
}

/**
 * DELETE /api/products/admin/[id]/images/[imageId]
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id: productId, imageId } = await params;

  if (!productId) return jsonError(400, "INVALID_ID", "Missing product id");
  if (!imageId) return jsonError(400, "INVALID_IMAGE_ID", "Missing image id");

  const { data, error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId)
    .eq("product_id", productId)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(
      status,
      status === 404 ? "NOT_FOUND" : "IMAGE_DELETE_FAILED",
      status === 404 ? "Image not found for this product" : error.message,
      error
    );
  }

  return NextResponse.json({ ok: true, data });
}