import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminClient } from "@/lib/require-admin";

type Params = { params: Promise<{ id: string }> };

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  return requireAdminClient(supabase);
}

function normalizeImage(img: any) {
  const storage_path = img.storage_path ?? img.object_path ?? null;
  const alt = img.alt ?? img.alt_text ?? null;
  const position = typeof img.position === "number" ? img.position : (typeof img.sort_order === "number" ? img.sort_order : 0);
  return { ...img, storage_path, alt, position };
}

function normalizeVariant(v: any) {
  const position = typeof v.position === "number" ? v.position : 0;
  const images = (v.research_variant_images ?? [])
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)))
    .map((vi: any) => ({
      image_id: vi.image_id,
      position: vi.position,
      is_primary: vi.is_primary,
      image_type: vi.image_type,
    }));
  return { ...v, position, images };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data, error } = await supabase
    .from("research_products")
    .select(`
      *,
      research_product_images (*),
      research_product_variants (
        *,
        research_variant_images (variant_id, image_id, position, is_primary, image_type)
      ),
      research_product_categories (
        research_categories (*)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" || /0 rows/i.test(error.message) ? 404 : 500;
    return jsonError(status, status === 404 ? "NOT_FOUND" : "PRODUCT_FETCH_FAILED", status === 404 ? "Product not found" : error.message, error);
  }

  const categories = (data as any)?.research_product_categories?.map((pc: any) => pc.research_categories).filter(Boolean) ?? [];
  // Tags/Collections are shop-only concepts with no research_* equivalent yet.
  const tags: any[] = [];
  const collections: any[] = [];

  const images = ((data as any)?.research_product_images ?? [])
    .map(normalizeImage)
    .slice()
    .sort((a: any, b: any) => (Number(a.position ?? 0) - Number(b.position ?? 0)));

  const variants = ((data as any)?.research_product_variants ?? [])
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

  const allowed = new Set([
    "badge",
    "compare_at_price_cents",
    "description",
    "is_featured",
    "price_cents",
    "search_text",
    "slug",
    "status",
    "title",
    "brand",
    "cas_number",
    "purity_percent",
    "research_use_only",
  ]);
  const update: Record<string, any> = {};
  for (const [k, v] of Object.entries(body ?? {})) {
    if (allowed.has(k)) update[k] = v;
  }

  if (!Object.keys(update).length) return jsonError(400, "NO_FIELDS", "No updatable fields were provided");

  const { data, error } = await supabase.from("research_products").update(update).eq("id", id).select("*").single();
  if (error) return jsonError(500, "PRODUCT_UPDATE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const supabase = await createServerClient();
  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { id } = await params;
  if (!id) return jsonError(400, "INVALID_ID", "Missing product id");

  const { data, error } = await supabase.from("research_products").update({ status: "archived" }).eq("id", id).select("*").single();
  if (error) return jsonError(500, "PRODUCT_ARCHIVE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}
