import { NextRequest, NextResponse } from "next/server";
import { hasValidApliiqCallbackToken } from "@/lib/fulfillment/apliiq";
import { supabasePublicUrlFromImage } from "@/lib/images";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!hasValidApliiqCallbackToken(url)) {
    return NextResponse.json({ error: "Unauthorized callback" }, { status: 401 });
  }

  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
  const admin = createAdminClient();
  let query = admin
    .from("products")
    .select(`
      id,
      title,
      product_images (
        bucket_name,
        object_path,
        alt_text,
        sort_order,
        position,
        is_primary,
        is_public
      )
    `)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (search) {
    const escaped = search.replace(/[%_,()]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%,search_text.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []).map((product: any) => ({
    store_ProductId: product.id,
    name: product.title,
    imageUrls: (product.product_images ?? [])
      .filter((image: any) => image.is_public !== false)
      .sort((a: any, b: any) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || Number(a.sort_order ?? a.position ?? 0) - Number(b.sort_order ?? b.position ?? 0))
      .map((image: any) => supabasePublicUrlFromImage(image))
      .filter(Boolean),
  })));
}
