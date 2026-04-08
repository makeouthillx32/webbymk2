import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export async function GET() {
  try {
    const supabase = createServerClient();

    // 1) shop id
    const { data: shop, error: shopErr } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", "shop")
      .maybeSingle();

    if (shopErr) return jsonError(500, "SHOP_LOOKUP_FAILED", shopErr.message, shopErr);

    // 2) landing tiles (children of shop)
    const { data: cats, error: catsErr } = await supabase
      .from("categories")
      .select("name,slug,position,parent_id")
      .eq("parent_id", shop?.id ?? null)
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .limit(12);

    if (catsErr) return jsonError(500, "CATEGORIES_FAILED", catsErr.message, catsErr);

    const categories =
      (cats ?? []).slice(0, 6).map((c) => ({
        title: c.name,
        href: `/shop/${c.slug}`,
      })) ?? [];

    // 3) featured (REAL)
    const { data: featured, error: featErr } = await supabase
      .from("products")
      .select("title,slug,is_featured,status,updated_at,created_at")
      .eq("status", "active")
      .eq("is_featured", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(4);

    if (featErr) return jsonError(500, "FEATURED_FAILED", featErr.message, featErr);

    // fallback if nobody is marked featured yet
    let picks = featured ?? [];
    if (!picks.length) {
      const { data: newest, error: newestErr } = await supabase
        .from("products")
        .select("title,slug,status,updated_at,created_at")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(4);

      if (newestErr) return jsonError(500, "NEWEST_FAILED", newestErr.message, newestErr);
      picks = newest ?? [];
    }

    const featuredPlaceholders = picks.map((p) => ({
      label: p.title,
      // (optional for later: add href/image/price; keeping your current component contract for now)
      // href: `/products/${p.slug}`,
    }));

    return NextResponse.json(
      { ok: true, data: { categories, featuredPlaceholders } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return jsonError(500, "LANDING_FAILED", e?.message ?? "Unknown error", e);
  }
}
