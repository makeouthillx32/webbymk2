// app/api/newsletter/subscribe/route.ts
// Backs the blog "Stay in the Loop" band. Stores the signup in
// newsletter_subscribers and sends a welcome email through our own
// poste.io SMTP relay (see src/lib/mail) — no third-party ESP.
//
// CORS: the blog zone's built image doesn't bundle /api routes (its
// zone Dockerfile only preserves provider.tsx/providers, not the
// api/actions/pages set the "landing" preset is documented to keep —
// see src/ink/zone-templates.ts vs. what's actually baked into the
// deployed blog image). So NewsletterBand.tsx calls this route by
// absolute URL against the core domain (www.unenter.live), which is a
// cross-origin request from blog.unenter.live and needs these headers.
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendMail } from "@/lib/mail/client";
import { getMailIdentity, formatFrom } from "@/lib/mail/identities";
import { renderNewsletterWelcomeEmail } from "@/lib/mail/newsletterWelcome";
import { resolveEmailPalette } from "@/lib/mail/theme";

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowed = /^https:\/\/([a-z0-9-]+\.)?unenter\.live$/i.test(origin) || origin === "http://localhost:3000";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://www.unenter.live",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonOk(request: NextRequest, data: any) {
  return NextResponse.json({ ok: true, data }, { headers: corsHeaders(request) });
}

function jsonError(request: NextRequest, status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, error: { code, message } },
    { status, headers: corsHeaders(request) }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const email = body?.email?.toString().trim().toLowerCase();
    const source = body?.source?.toString().slice(0, 64) || "blog_band";

    if (!email || !EMAIL_RE.test(email)) {
      return jsonError(request, 400, "INVALID_EMAIL", "Enter a valid email address");
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      if (existing.status === "unsubscribed") {
        await supabase
          .from("newsletter_subscribers")
          .update({ status: "subscribed", unsubscribed_at: null })
          .eq("id", existing.id);
      }
      // Already on the list (or just resubscribed) — don't resend the
      // welcome email, just confirm success to the client.
      return jsonOk(request, { subscribed: true, already_subscribed: existing.status !== "unsubscribed" });
    }

    const themeId = request.cookies.get("themeId")?.value ?? null;

    const { error: insertError } = await supabase
      .from("newsletter_subscribers")
      .insert({ email, source, theme_id: themeId });

    if (insertError) {
      // Unique-index race — someone else's request just created the row.
      if (insertError.code === "23505") {
        return jsonOk(request, { subscribed: true, already_subscribed: true });
      }
      console.error("[newsletter] insert failed:", insertError.message);
      return jsonError(request, 500, "SUBSCRIBE_FAILED", "Could not subscribe right now — try again shortly");
    }

    const identity = getMailIdentity("support");
    const palette = await resolveEmailPalette(themeId);
    const { subject, html, text } = renderNewsletterWelcomeEmail(email, palette);

    const sendResult = await sendMail({
      to: email,
      from: formatFrom(identity),
      replyTo: identity.mailbox,
      subject,
      html,
      text,
      credentials: identity.credentials,
    });

    if (!sendResult.sent) {
      // Non-fatal — the subscription itself succeeded, only the welcome
      // email failed to send (e.g. SMTP not configured yet).
      console.warn("[newsletter] welcome email not sent:", sendResult.reason);
    }

    return jsonOk(request, { subscribed: true, welcomed: sendResult.sent });
  } catch (err) {
    console.error("[newsletter] subscribe error:", err);
    return jsonError(request, 500, "INTERNAL", "Internal server error");
  }
}
