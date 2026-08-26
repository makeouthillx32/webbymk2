// app/api/webhooks/tank-welcome/route.ts
// Internal-only — called by the tank_profiles AFTER INSERT trigger via
// pg_net (Postgres container → this app, same private Docker network,
// never exposed publicly beyond that). Shared-secret bearer token, not a
// real auth scheme, matches this being a same-network service call rather
// than anything a browser or external party should ever reach.
import { NextResponse } from "next/server";
import { sendTankWelcomeEmail } from "@/lib/mail/sendTankWelcome";
import { createAdminClient } from "@/utils/supabase/admin";
import { fireOverlayAction } from "@/zones/tank/server/overlays";

export async function POST(request: Request) {
  const secret = process.env.TANK_WELCOME_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const userId = body?.user_id;
  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const result = await sendTankWelcomeEmail(userId);

  // Same real event driving the welcome email also fires the "someone
  // signed up" browser overlay — no-ops safely if no tank_signup action
  // trigger exists yet (see server/overlays.ts / House Console Overlays).
  try {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("tank_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    await fireOverlayAction("tank_signup", profile?.display_name || "A new viewer");
  } catch {}

  return NextResponse.json(result, { status: result.sent ? 200 : 502 });
}
