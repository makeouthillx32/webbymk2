import { NextResponse } from "next/server";
import { getRoomOverlayStatus } from "@/zones/tank/server/roomOverlayStatus";

// Status feed for the OBS "room is offline" browser source.
//
// Unauthenticated on purpose: an OBS browser source runs on the streamer's
// machine as an anonymous page load, with no session and no way to carry a
// secret that would not immediately be readable in the scene's URL field.
// What it discloses is narrow by design — the caller must already know the
// room key, and gets back only that room's state. It never enumerates rooms,
// so it cannot be used to discover which rooms exist or which are hidden.

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const roomKey = new URL(request.url).searchParams.get("room")?.trim();
  if (!roomKey) {
    return NextResponse.json({ error: "room is required" }, { status: 400 });
  }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(roomKey)) {
    return NextResponse.json({ error: "invalid room key" }, { status: 400 });
  }

  const status = await getRoomOverlayStatus(roomKey);
  return NextResponse.json(status, {
    // The overlay polls this. Caching it would delay the very transition the
    // overlay exists to show.
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
