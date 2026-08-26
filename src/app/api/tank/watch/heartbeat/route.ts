import { NextRequest, NextResponse } from "next/server";
import { recordWatchHeartbeat, type WatchMode } from "@/zones/tank/server/watchTimeAccrual";
import { reportTankClientTelemetryToManager } from "@/zones/tank/server/receiverManager";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const seconds = typeof body.seconds === "number" ? body.seconds : 10;
    const watchMode: WatchMode = body.watchMode === "room_direct" ? "room_direct" : "director";
    const roomId: string | undefined = typeof body.roomId === "string" ? body.roomId : undefined;

    // Forward real-time client health telemetry to the Ingest Tool asynchronously
    if (body.telemetry && typeof body.telemetry === "object") {
      void reportTankClientTelemetryToManager({
        activeRooms: roomId ? { [roomId]: 1 } : { main: 1 },
        averageLatencyMs: typeof body.telemetry.averageLatencyMs === "number" ? body.telemetry.averageLatencyMs : undefined,
        clientNetworkType: typeof body.telemetry.networkType === "string" ? body.telemetry.networkType : undefined,
        totalViewers: 1,
        stallCount: typeof body.telemetry.stallCount === "number" ? body.telemetry.stallCount : 0,
      }).catch(() => {});
    }

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
