// src/app/api/dashboard/ad-campaigns/route.ts
//
// Marketing role's ad-campaign planner — list/create.
//
// Deliberately reuses tank_house_events instead of a new table: it's a
// generic scheduled-execution row (event_type, jsonb payload, execute_at,
// a status lifecycle that already matches scheduled → publishing →
// published/cancelled/failed) that has zero live consumers anywhere in the
// app today (confirmed 2026-09-24 — only referenced in the generated
// Supabase types, no code reads or writes it). Namespaced here by
// room_id = "marketing" and event_type = "ad_campaign" so this can never
// collide with an actual Tank room event. No migration needed.
//
// This is the planning/scheduling half only — no ad platform is wired up
// yet (that needs an OAuth app registered per-platform: Meta Business,
// Google Ads API access, TikTok for Business, LinkedIn Marketing Developer
// Platform, X Ads API — all external, business-side setup). `payload`
// carries everything a real publisher would need once that exists.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireRoleClient } from "@/lib/require-admin";

const ROOM_ID = "marketing";
const EVENT_TYPE = "ad_campaign";

export const dynamic = "force-dynamic";

export type AdPlatform = "meta" | "tiktok" | "linkedin" | "google" | "x" | "youtube";
const VALID_PLATFORMS: AdPlatform[] = ["meta", "tiktok", "linkedin", "google", "x", "youtube"];

// Which zone this post/campaign is promoting — "core" means site-wide, not
// scoped to one storefront/zone. Matches the real zone keys used elsewhere
// (see components/Layouts/zone-overrides.ts) rather than inventing new ones.
export type AdZone = "core" | "shop" | "labs" | "tank" | "blog";
const VALID_ZONES: AdZone[] = ["core", "shop", "labs", "tank", "blog"];

export async function GET() {
  const authClient = await createClient();
  const gate = await requireRoleClient(authClient, ["admin", "marketing"]);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_house_events")
    .select("*")
    .eq("room_id", ROOM_ID)
    .eq("event_type", EVENT_TYPE)
    .order("execute_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const gate = await requireRoleClient(authClient, ["admin", "marketing"]);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const title = String(body.title || "").trim().slice(0, 200);
  const platform = String(body.platform || "") as AdPlatform;
  const zone = String(body.zone || "core") as AdZone;
  const executeAt = String(body.execute_at || "");
  const budgetCents = Number.isFinite(body.budget_cents) ? Math.max(0, Math.round(body.budget_cents)) : null;
  const audience = String(body.audience || "").trim().slice(0, 500) || null;
  const copy = String(body.copy || "").trim().slice(0, 5000) || null;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "invalid_platform" }, { status: 400 });
  }
  if (!VALID_ZONES.includes(zone)) {
    return NextResponse.json({ error: "invalid_zone" }, { status: 400 });
  }
  if (!executeAt || Number.isNaN(new Date(executeAt).getTime())) {
    return NextResponse.json({ error: "invalid_execute_at" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_house_events")
    .insert({
      room_id: ROOM_ID,
      event_type: EVENT_TYPE,
      body: title,
      execute_at: executeAt,
      status: "scheduled",
      created_by: gate.user.id,
      payload: { platform, zone, budget_cents: budgetCents, audience, copy },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}
