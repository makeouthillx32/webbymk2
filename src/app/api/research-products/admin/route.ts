import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdminClient } from "@/lib/require-admin";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

async function requireAdmin(supabase: SupabaseClient) {
  return requireAdminClient(supabase);
}

/**
 * GET /api/research-products/admin
 * Admin list (any status). Empty list returns ok:true, data:[]
 *
 * Query:
 *  - limit (1..200) default 50
 *  - offset (>=0)  default 0
 *  - status = all | draft | active | archived (etc)
 *  - q = search string (matches products.search_text via ILIKE)
 */
export async function GET(req: NextRequest) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  const status = (searchParams.get("status") ?? "all").toLowerCase();
  const q = (searchParams.get("q") ?? "").trim();

  let query = supabase
    .from("research_products")
    .select(
      `
      id,
      slug,
      title,
      description,
      dosage_label,
      price_cents,
      compare_at_price_cents,
      currency,
      badge,
      is_featured,
      status,
      created_at,

      research_product_images (
        id,
        bucket_name,
        object_path,
        alt_text,
        position,
        sort_order,
        is_primary,
        is_public,
        created_at
      ),
      research_product_categories (
        research_categories (
          id,
          name,
          slug
        )
      )
    `
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status !== "all") query = query.eq("status", status);

  // you confirmed products.search_text exists
  if (q) query = query.ilike("search_text", `%${q}%`);

  const { data, error } = await query;
  if (error) return jsonError(500, "PRODUCT_ADMIN_LIST_FAILED", error.message, error);

  // Normalize + stable sort of images
  const normalized = (data ?? []).map((p: any) => {
    const imgs = (p.research_product_images ?? []).slice().sort((a: any, b: any) => {
      const sa = typeof a.sort_order === "number" ? a.sort_order : 0;
      const sb = typeof b.sort_order === "number" ? b.sort_order : 0;
      if (sa !== sb) return sa - sb;

      const pa = typeof a.position === "number" ? a.position : 0;
      const pb = typeof b.position === "number" ? b.position : 0;
      if (pa !== pb) return pa - pb;

      const ca = a.created_at ? Date.parse(a.created_at) : 0;
      const cb = b.created_at ? Date.parse(b.created_at) : 0;
      return ca - cb;
    });

    const categories = (p.research_product_categories ?? [])
      .map((pc: any) => pc.research_categories)
      .filter(Boolean);

    return { ...p, product_images: imgs, categories };
  });

  // ✅ Debug guard: if THIS triggers, your UI will definitely get "Missing product id"
  const missing = normalized.filter((p: any) => !p?.id);
  if (missing.length) {
    return jsonError(
      500,
      "MISSING_PRODUCT_ID",
      "One or more products returned without an id (cannot manage products).",
      { count: missing.length, sample: missing[0] }
    );
  }

  return NextResponse.json({
    ok: true,
    data: normalized,
    meta: { limit, offset, status, q },
  });
}

/**
 * POST /api/research-products/admin
 * Create product (draft)
 *
 * Body: { slug, title, description?, brand?, cas_number?, purity_percent?, research_use_only?, price_cents }
 *
 * Note: this used to insert `material` / `made_in` — shop-inherited fields
 * that were never columns on research_products, so every create through
 * this route errored with a Postgres "column does not exist" failure.
 * Swapped for real research-chemical fields instead.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  const gate = await requireAdmin(supabase);
  if (!gate.ok) return jsonError(gate.status, "UNAUTHORIZED", gate.message);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Body must be valid JSON");
  }

  const {
    slug,
    title,
    description = null,
    brand = null,
    cas_number = null,
    purity_percent = null,
    research_use_only = true,
    price_cents,
  } = body ?? {};

  if (!slug || typeof slug !== "string") {
    return jsonError(400, "INVALID_SLUG", "slug is required");
  }
  if (!title || typeof title !== "string") {
    return jsonError(400, "INVALID_TITLE", "title is required");
  }
  if (typeof price_cents !== "number" || !Number.isFinite(price_cents) || price_cents < 0) {
    return jsonError(400, "INVALID_PRICE", "price_cents must be a number >= 0");
  }

  const { data, error } = await supabase
    .from("research_products")
    .insert({
      slug,
      title,
      description,
      brand,
      cas_number,
      purity_percent,
      research_use_only,
      price_cents,
      status: "draft",
    })
    .select(
      `
      id,
      slug,
      title,
      description,
      brand,
      cas_number,
      purity_percent,
      research_use_only,
      price_cents,
      compare_at_price_cents,
      currency,
      badge,
      is_featured,
      status,
      created_at
    `
    )
    .single();

  if (error) return jsonError(500, "PRODUCT_CREATE_FAILED", error.message, error);

  return NextResponse.json({ ok: true, data });
}
