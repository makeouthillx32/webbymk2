import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import { pickActiveGoal, type GoalSource } from "@/zones/tank/obs/goalProgress";
import { getPresenceSnapshot } from "@/zones/tank/server/viewerPresence";

// Stream goals for the /obs/goal overlay.
//
// GET is UNAUTHENTICATED, like the other overlay endpoints: an OBS browser
// source has no session and cannot be given one, and a goal bar is on screen
// for every viewer by definition. There is nothing here that the broadcast does
// not already show.
//
// POST is staff only.

export const dynamic = "force-dynamic";

const SOURCES: GoalSource[] = ["manual", "viewers", "followers", "drops", "tavern"];

type Row = {
  id: string;
  label: string;
  source: GoalSource;
  source_provider: string | null;
  target: number;
  current_value: number;
  accent_color: string;
  show_count: boolean;
  is_active: boolean;
  sort_order: number;
};

const toGoal = (row: Row) => ({
  id: row.id,
  label: row.label,
  source: row.source,
  sourceProvider: row.source_provider,
  target: row.target,
  currentValue: row.current_value,
  accentColor: row.accent_color,
  showCount: row.show_count,
  isActive: row.is_active,
  sortOrder: row.sort_order,
});

/**
 * Measure a computed source.
 *
 * Returns null when it cannot, which the overlay renders as "hold the last
 * known value" rather than zero — see resolveGoalProgress. A bar that drops to
 * 0 because one count failed looks like a broken feature on air.
 */
async function measure(source: GoalSource): Promise<number | null> {
  if (source === "manual") return null;
  try {
    if (source === "viewers") {
      // The shared cached snapshot, not a fresh count. Presence is already
      // counted in Postgres once per cache window for the whole site; a goal
      // bar polling every few seconds must not add a second counter.
      const snapshot = await getPresenceSnapshot();
      return snapshot.online;
    }

    const admin = createAdminClient();

    if (source === "drops") {
      // People who have earned watch-time toward a drop, not the number of
      // campaigns configured — the campaign count would sit at 2 forever and
      // make the bar look frozen.
      const { count, error } = await admin
        .from("tank_drop_progress")
        .select("*", { count: "exact", head: true });
      return error ? null : count ?? null;
    }

    if (source === "tavern") {
      // Chits actually resolved: drinks served, not drinks ordered.
      const { count, error } = await admin
        .from("tank_tavern_chits")
        .select("*", { count: "exact", head: true })
        .not("resolved_at", "is", null);
      return error ? null : count ?? null;
    }

    // followers has no counter Tank can read: no provider is connected. Null
    // rather than 0, so the stored value shows instead of a confident zero.
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_stream_goals")
    .select("id, label, source, source_provider, target, current_value, accent_color, show_count, is_active, sort_order")
    .order("sort_order", { ascending: true });

  if (error) {
    // Never 500 at a browser source. An empty goal list renders nothing, which
    // is the correct appearance for "no goal on air".
    console.warn(`[TankGoals] read failed: ${error.message}`);
    return NextResponse.json({ success: true, goals: [], active: null, liveValue: null });
  }

  const goals = ((data ?? []) as Row[]).map(toGoal);
  const active = pickActiveGoal(goals);
  const liveValue = active ? await measure(active.source) : null;

  return NextResponse.json(
    { success: true, goals, active, liveValue },
    { headers: { "Cache-Control": "public, max-age=5, stale-while-revalidate=30" } },
  );
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = body as Partial<Row> & { id?: string };
  const patch: Record<string, unknown> = { updated_by: staff.id };

  if (typeof input.label === "string") patch.label = input.label.slice(0, 120);
  if (typeof input.source === "string") {
    if (!SOURCES.includes(input.source as GoalSource)) {
      return NextResponse.json({ error: `Unknown source "${input.source}"` }, { status: 400 });
    }
    patch.source = input.source;
  }
  // Guarded rather than trusted: a zero target divides by zero downstream, and
  // the DB constraint would reject it with a message nobody reads on air.
  if (input.target !== undefined) {
    const target = Number(input.target);
    if (!Number.isFinite(target) || target < 1) {
      return NextResponse.json({ error: "target must be at least 1" }, { status: 400 });
    }
    patch.target = Math.round(target);
  }
  if (input.current_value !== undefined) {
    const value = Number(input.current_value);
    if (!Number.isFinite(value) || value < 0) {
      return NextResponse.json({ error: "current_value cannot be negative" }, { status: 400 });
    }
    patch.current_value = Math.round(value);
  }
  if (typeof input.accent_color === "string" && /^#[0-9a-f]{3,8}$/i.test(input.accent_color)) {
    patch.accent_color = input.accent_color;
  }
  if (typeof input.show_count === "boolean") patch.show_count = input.show_count;
  if (typeof input.is_active === "boolean") patch.is_active = input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = Math.round(Number(input.sort_order) || 0);

  const admin = createAdminClient();

  if (!input.id) {
    const { data, error } = await admin.from("tank_stream_goals").insert(patch).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, goal: toGoal(data as Row) });
  }

  const { data, error } = await admin
    .from("tank_stream_goals")
    .update(patch)
    .eq("id", input.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, goal: toGoal(data as Row) });
}

export async function DELETE(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("tank_stream_goals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
