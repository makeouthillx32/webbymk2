// src/app/api/dashboard/ad-campaigns/[id]/route.ts
// Update or cancel a single ad-campaign row. See ../route.ts for the
// tank_house_events reuse rationale.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireRoleClient } from "@/lib/require-admin";

const ROOM_ID = "marketing";
const EVENT_TYPE = "ad_campaign";
const VALID_STATUSES = ["scheduled", "publishing", "published", "cancelled", "failed"];

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createClient();
  const gate = await requireRoleClient(authClient, ["admin", "marketing"]);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.body = body.title.trim().slice(0, 200);
  if (typeof body.execute_at === "string" && !Number.isNaN(new Date(body.execute_at).getTime())) {
    patch.execute_at = body.execute_at;
  }
  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.payload && typeof body.payload === "object") {
    patch.payload = body.payload;
  }
  patch.updated_at = new Date().toISOString();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_house_events")
    .update(patch)
    .eq("id", id)
    .eq("room_id", ROOM_ID)
    .eq("event_type", EVENT_TYPE)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authClient = await createClient();
  const gate = await requireRoleClient(authClient, ["admin", "marketing"]);
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status });

  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin
    .from("tank_house_events")
    .delete()
    .eq("id", id)
    .eq("room_id", ROOM_ID)
    .eq("event_type", EVENT_TYPE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
