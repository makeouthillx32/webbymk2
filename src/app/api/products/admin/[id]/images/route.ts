// app/api/products/admin/[id]/images/route.ts
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

  // Check auth (reuse your requireAdmin if you have it)
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

  const { bucket_name, object_path, alt_text, is_public, is_primary, sort_order } = body;

  if (!bucket_name || !object_path) {
    return jsonError(400, "MISSING_FIELDS", "bucket_name and object_path are required");
  }

  // ✅ Get the next available position for this product
  const { data: existingImages } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", id)
    .order("position", { ascending: false })
    .limit(1);

  // Calculate next position (max + 1, or 0 if no images exist)
  const nextPosition = existingImages && existingImages.length > 0 
    ? (existingImages[0].position ?? 0) + 1 
    : 0;

  // Insert into product_images table
  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: id,
      bucket_name,
      object_path,
      alt_text: alt_text ?? null,
      is_public: is_public ?? true,
      is_primary: is_primary ?? false,
      sort_order: sort_order ?? nextPosition,
      position: nextPosition, // ✅ Use calculated position
    })
    .select("*")
    .single();

  if (error) {
    return jsonError(500, "IMAGE_INSERT_FAILED", error.message, error);
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();

  // ✅ Await params
  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  // Check auth
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

  const { image_id } = body;
  if (!image_id) {
    return jsonError(400, "MISSING_IMAGE_ID", "image_id is required");
  }

  // Delete the image record
  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", image_id)
    .eq("product_id", id); // Safety: ensure it belongs to this product

  if (error) {
    return jsonError(500, "IMAGE_DELETE_FAILED", error.message, error);
  }

  return NextResponse.json({ ok: true });
}