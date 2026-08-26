// app/api/webhooks/overlay-fire/route.ts
// Internal-only — called by tank_run_overlay_cron_trigger() via pg_net
// (Postgres container → this app, same private Docker network, never
// exposed publicly beyond that), same shape as /api/webhooks/tank-welcome.
// Deliberately takes only a triggerId — the message/scene/sound are looked
// up fresh from the DB here, never embedded in the cron job's SQL body.
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { broadcastOverlayEvent } from "@/zones/tank/server/overlays";

export async function POST(request: Request) {
  const secret = process.env.TANK_OVERLAY_WEBHOOK_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const triggerId = body?.triggerId;
  if (typeof triggerId !== "string" || !triggerId) {
    return NextResponse.json({ error: "triggerId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: trigger } = await admin
    .from("tank_overlay_triggers")
    .select("id, scene_id, message, enabled")
    .eq("id", triggerId)
    .maybeSingle();

  if (!trigger || !trigger.enabled) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await broadcastOverlayEvent(trigger.scene_id, trigger.message);
  await admin
    .from("tank_overlay_triggers")
    .update({ last_fired_at: new Date().toISOString() })
    .eq("id", triggerId);

  return NextResponse.json({ ok: true });
}
