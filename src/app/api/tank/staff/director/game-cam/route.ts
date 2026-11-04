import { NextResponse } from "next/server";
import { checkStaff, staffDenialResponse } from "@/zones/tank/server/staffAuth";
import { clearGameCamHold, loadGameCamKeys, setGameCamHold } from "@/zones/tank/server/gameCams";
import { tickServerDirector } from "@/zones/tank/server/serverDirectorEngine";

export const dynamic = "force-dynamic";

// Staff take a game cam (POST { roomKey }) or hand it back to the tour
// (DELETE). Only matters in GAME mode: the director ignores the hold while
// any room is on air. The cut lands on the next tick, forced here so the
// console doesn't wait up to 3 s for it.

async function denied() {
  const check = await checkStaff();
  if (check.staff) return { staff: check.staff, response: null };
  const body = staffDenialResponse(check.denial);
  return { staff: null, response: NextResponse.json(body.body, { status: body.status }) };
}

export async function POST(req: Request) {
  const { staff, response } = await denied();
  if (!staff) return response;
  const body = (await req.json().catch(() => null)) as { roomKey?: unknown } | null;
  const roomKey = typeof body?.roomKey === "string" ? body.roomKey : "";
  const keys = await loadGameCamKeys();
  if (!keys.includes(roomKey)) {
    return NextResponse.json({ error: "No game cam for that room", keys }, { status: 400 });
  }
  const hold = setGameCamHold(roomKey, staff.role === "admin" ? "Admin" : "Moderator");
  const state = await tickServerDirector().catch(() => null);
  return NextResponse.json({ hold, state }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const { staff, response } = await denied();
  if (!staff) return response;
  clearGameCamHold();
  const state = await tickServerDirector().catch(() => null);
  return NextResponse.json({ hold: null, state }, { headers: { "Cache-Control": "no-store" } });
}
