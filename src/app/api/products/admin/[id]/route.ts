import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false, status: 401 as const, message: "Authentication required" };
  return { ok: true as const };
}

function normalizeImage(img: any) {
  const storage_path = img.storage_path ?? img.object_path ?? null;
  const alt = img.alt ?? img.alt_text ?? null;
  const position = typeof img.position === "number" ? img.position : (typeof img.sort_order === "number" ? img.sort_order : 0);
  return { ...img, storage_path, alt, position };
}

function normalizeVariant(v: any) {
  const position = typeof v.position === "number" ? v.position : 0;
  return { ...v, position };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data, error } = await supabase
    .from("products")
    .select(`
      *,
      product_images (*),
      product_variants (*),
      product_categories (
        categories (*)
      ),
      product_tags (
        tags (*)
      ),
      product_collections (
        collections (*)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(status, status === 404 ? "NOT_FOUND" : "PRODUCT_FETCH_FAILED", status === 404 ? "Product not found" : error.message, error);
  }

  const categories = data?.product_categories?.map((pc: any) => pc.categories).filter(Boolean) ?? [];
  const tags = data?.product_tags?.map((pt: any) => pt.tags).filter(Boolean) ?? [];
  const collections = data?.product_collections?.map((pc: any) => pc.collections).filter(Boolean) ?? [];

  const images = (data?.product_images ?? [])
    .map(normalizeImage)
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)));

  const variants = (data?.product_variants ?? [])
    .map(normalizeVariant)
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)));

  return NextResponse.json({
    ok: true,
    data: {
      ...data,
      product_images: images,
      product_variants: variants,
      categories,
      tags,
      collections,
    },
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const allowed = new Set(["badge", "compare_at_price_cents", "description", "is_featured", "price_cents", "search_text", "slug", "status", "title"]);
  const update: Record<string, any> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (allowed.has(k)) update[k] = v;
  }

  if (!Object.keys(update).length) return jsonError(400, "NO_FIELDS", "No updatable fields were provided");

  const { data, error } = await supabase.from("products").update(update).eq("id", id).select("*").single();
  if (error) return jsonError(500, "PRODUCT_UPDATE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data, error } = await supabase.from("products").update({ status: "archived" }).eq("id", id).select("*").single();
  if (error) return jsonError(500, "PRODUCT_ARCHIVE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}