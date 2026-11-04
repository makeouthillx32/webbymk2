import { NextResponse } from "next/server";
import { checkStaff, staffDenialResponse } from "@/zones/tank/server/staffAuth";
import { getHouseCast, getLastSeen } from "@/zones/tank/server/houseCastWorker";
import { loadUntrackedCast, setCastTracked } from "@/zones/tank/server/houseCastPrefs";
import { CAST_RIGS } from "@/zones/tank/vision/houseCast";

export const dynamic = "force-dynamic";

// Staff switch mirroring per cast member: GET the roster (who has a sprite,
// who is untracked, who is mirrored right now), POST { id, tracked } to flip
// one. An untracked member drops out of the house on the next cast tick.

async function denied() {
  const check = await checkStaff();
  if (check.staff) return null;
  const body = staffDenialResponse(check.denial);
  return NextResponse.json(body.body, { status: body.status });
}

async function roster() {
  const untracked = await loadUntrackedCast();
  const live = new Map(getHouseCast().members.map((m) => [m.id, m]));
  const lastSeen = getLastSeen();
  return Object.entries(CAST_RIGS).map(([id, { kind }]) => ({
    id,
    kind,
    tracked: !untracked.has(id),
    room: live.get(id)?.room ?? null,
    lastSeen: lastSeen[id] ? { room: lastSeen[id].room, at: lastSeen[id].at } : null,
  }));
}

export async function GET() {
  const response = await denied();
  if (response) return response;
  return NextResponse.json({ members: await roster() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const response = await denied();
  if (response) return response;
  const body = (await req.json().catch(() => null)) as { id?: unknown; tracked?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!(id in CAST_RIGS) || typeof body?.tracked !== "boolean") {
    return NextResponse.json({ error: "Expected { id: <cast id>, tracked: boolean }" }, { status: 400 });
  }
  try {
    await setCastTracked(id, body.tracked);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
  return NextResponse.json({ members: await roster() }, { headers: { "Cache-Control": "no-store" } });
}
