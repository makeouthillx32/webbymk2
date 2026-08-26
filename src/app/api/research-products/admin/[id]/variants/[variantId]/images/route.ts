import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string; variantId: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  return requireAdminClient(supabase);
}

// GET /api/research-products/admin/[id]/variants/[variantId]/images
// List images currently assigned to this variant.
export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { variantId } = await params;

  const { data, error } = await supabase
    .from("research_variant_images")
    .select("variant_id, image_id, position, is_primary, image_type, created_at")
    .eq("variant_id", variantId)
    .order("position", { ascending: true });

  if (error) return jsonError(500, "VARIANT_IMAGES_FETCH_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data: data ?? [] });
}

// POST /api/research-products/admin/[id]/variants/[variantId]/images
// Body: { image_id: string, is_primary?: boolean }
// Links an already-uploaded product image to this variant.
export async function POST(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id, variantId } = await params;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const image_id = body?.image_id;
  if (!image_id || typeof image_id !== "string") {
    return jsonError(400, "INVALID_IMAGE_ID", "image_id is required");
  }

  const image_type = body?.image_type === "lab_report" ? "lab_report" : "photo";

  // Make sure the image actually belongs to this product (guards against
  // cross-product image_id typos / tampering).
  const { data: img, error: imgErr } = await supabase
    .from("research_product_images")
    .select("id")
    .eq("id", image_id)
    .eq("product_id", id)
    .maybeSingle();

  if (imgErr) return jsonError(500, "IMAGE_LOOKUP_FAILED", imgErr.message, imgErr);
  if (!img) return jsonError(404, "IMAGE_NOT_FOUND", "Image does not belong to this product");

  const { data: maxData } = await supabase
    .from("research_variant_images")
    .select("position")
    .eq("variant_id", variantId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (maxData?.[0]?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("research_variant_images")
    .upsert(
      {
        variant_id: variantId,
        image_id,
        position: nextPosition,
        is_primary: !!body?.is_primary,
        image_type,
      },
      { onConflict: "variant_id,image_id" }
    )
    .select()
    .single();

  if (error) return jsonError(500, "VARIANT_IMAGE_LINK_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}

// DELETE /api/research-products/admin/[id]/variants/[variantId]/images?image_id=...
// Unlinks an image from this variant (does not delete the image itself).
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { variantId } = await params;
  const { searchParams } = new URL(req.url);
  const image_id = searchParams.get("image_id");

  if (!image_id) return jsonError(400, "INVALID_IMAGE_ID", "image_id query param is required");

  const { error } = await supabase
    .from("research_variant_images")
    .delete()
    .eq("variant_id", variantId)
    .eq("image_id", image_id);

  if (error) return jsonError(500, "VARIANT_IMAGE_UNLINK_FAILED", error.message, error);

  return NextResponse.json({ ok: true });
}
