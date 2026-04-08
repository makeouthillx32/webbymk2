// app/api/landing/hero-slides/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/utils/supabase/server";

function jsonError(status: number, code: string, message: string, details?: any) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

function publicUrl(supabase: any, bucket: string, path?: string | null) {
  if (!bucket || !path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl ?? null;
}

async function requireAdmin() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false as const, status: 401 as const, message: error.message };
  if (!data.user) return { ok: false as const, status: 401 as const, message: "Not signed in" };

  // TODO: replace with your real role gating (admin/catalog manager)
  return { ok: true as const, supabase };
}

/**
 * GET /api/landing/hero-slides
 * Public-facing payload: adds computed public URLs for desktop + mobile
 */
export async function GET() {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("hero_slides")
    .select(
      [
        "id",
        "position",
        "is_active",

        // desktop
        "bucket_name",
        "object_path",
        "alt_text",

        // mobile
        "mobile_bucket_name",
        "mobile_object_path",
        "mobile_alt_text",
        "mobile_width",
        "mobile_height",

        // CTA / overlay fields you already store
        "pill_text",
        "headline_line1",
        "headline_line2",
        "subtext",
        "primary_button_label",
        "primary_button_href",
        "secondary_button_label",
        "secondary_button_href",
        "text_alignment",
        "text_color",
        "overlay_opacity",

        // tech
        "width",
        "height",
        "blurhash",
        "created_at",
        "updated_at",
      ].join(",")
    )
    .order("position", { ascending: true });

  if (error) return jsonError(500, "db_error", error.message, error);

  const rows = data ?? [];

  const mapped = rows.map((row: any) => {
    const bucket = row.bucket_name ?? "hero-images";
    const desktop_image_url = publicUrl(supabase, bucket, row.object_path);

    const mobileBucket = row.mobile_bucket_name ?? bucket;
    const mobile_image_url = publicUrl(supabase, mobileBucket, row.mobile_object_path);

    return {
      ...row,

      // ✅ computed urls used by the frontend
      desktop_image_url,
      mobile_image_url,

      // ✅ convenience fallbacks
      mobile_alt_text: row.mobile_alt_text ?? row.alt_text ?? null,
    };
  });

  return NextResponse.json({ ok: true, data: mapped });
}

/**
 * POST /api/landing/hero-slides
 * Admin-only create (keeps existing behavior)
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return jsonError(gate.status ?? 401, "unauthorized", gate.message ?? "Not signed in");

  const body = await req.json();

  const { data, error } = await gate.supabase
    .from("hero_slides")
    .insert(body)
    .select("*")
    .single();

  if (error) return jsonError(500, "db_error", error.message, error);
  return NextResponse.json({ ok: true, data });
}