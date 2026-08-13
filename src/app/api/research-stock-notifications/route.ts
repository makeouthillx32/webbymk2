// app/api/research-stock-notifications/route.ts
// "Notify me when this is back in stock" signup for research compounds
// (labs.unenter.live only — the regular shop doesn't have this feature).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createServerClient } from "@/utils/supabase/server";

function jsonOk(data: any) {
  return NextResponse.json({ ok: true, data });
}

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email?.toString().trim().toLowerCase();
    const research_product_id = body?.research_product_id?.toString();
    const research_variant_id = body?.research_variant_id ? body.research_variant_id.toString() : null;

    if (!email || !EMAIL_RE.test(email)) {
      return jsonError(400, "INVALID_EMAIL", "Enter a valid email address");
    }
    if (!research_product_id) {
      return jsonError(400, "MISSING_PRODUCT", "research_product_id is required");
    }

    const supabase = createAdminClient();

    const { data: product, error: productError } = await supabase
      .from("research_products")
      .select("id")
      .eq("id", research_product_id)
      .eq("status", "active")
      .maybeSingle();

    if (productError || !product) {
      return jsonError(404, "PRODUCT_NOT_FOUND", "Research product not found");
    }

    // Best-effort: attach the signed-in user if there is one, purely so
    // "my notify-me signups" could be surfaced later — not required.
    const auth = await createServerClient();
    const { data: { user } } = await auth.auth.getUser();

    const themeId = request.cookies.get("themeId")?.value ?? null;

    const { error: insertError } = await supabase.from("research_stock_notifications").insert({
      research_product_id,
      research_variant_id,
      email,
      user_id: user?.id ?? null,
      theme_id: themeId,
    });

    if (insertError) {
      // Unique partial index — already signed up and still pending.
      if (insertError.code === "23505") {
        return jsonOk({ subscribed: true, already_subscribed: true });
      }
      console.error("[stock-notify] insert failed:", insertError.message);
      return jsonError(500, "SIGNUP_FAILED", "Could not save your request — try again shortly");
    }

    return jsonOk({ subscribed: true });
  } catch (err) {
    console.error("[stock-notify] signup error:", err);
    return jsonError(500, "INTERNAL", "Internal server error");
  }
}
