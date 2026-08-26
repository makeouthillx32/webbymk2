import { NextRequest, NextResponse } from "next/server";
import { recordWatchHeartbeat, type WatchMode } from "@/zones/tank/server/watchTimeAccrual";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seconds = typeof body.seconds === "number" ? body.seconds : 10;
    const watchMode: WatchMode = body.watchMode === "room_direct" ? "room_direct" : "director";
    const roomId: string | undefined = typeof body.roomId === "string" ? body.roomId : undefined;

    const result = await recordWatchHeartbeat(seconds, watchMode, roomId);

    if (!result.success && result.error?.includes("Authentication")) {
      return NextResponse.json({ success: false, error: result.error }, { status: 401 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error." },
      { status: 500 },
    );
  }
}
