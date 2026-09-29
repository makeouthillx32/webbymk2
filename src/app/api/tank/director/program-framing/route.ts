import { NextResponse } from "next/server";
import { checkStaff, staffDenialResponse } from "@/zones/tank/server/staffAuth";
import { publishDirectorProgramFraming } from "@/zones/tank/server/serverDirectorEngine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { staff, denial } = await checkStaff();
  if (!staff) {
    const { status, body } = staffDenialResponse(denial ?? "unavailable");
    return NextResponse.json(body, { status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const activeCameraId =
    typeof body.activeCameraId === "string" ? body.activeCameraId.trim() : "";
  const activeRoomKey =
    typeof body.activeRoomKey === "string" ? body.activeRoomKey.trim() : "";
  if (!activeCameraId || !activeRoomKey) {
    return NextResponse.json(
      { error: "activeCameraId and activeRoomKey are required" },
      { status: 400 },
    );
  }

  try {
    const framing = await publishDirectorProgramFraming({
      activeCameraId,
      activeRoomKey,
      ptzState: body.ptzState ?? null,
    });
    return NextResponse.json({ success: true, framing });
  } catch (error) {
    console.error("[DirectorProgramFraming] publish failed:", error);
    return NextResponse.json({ error: "Programme framing unavailable" }, { status: 503 });
  }
}
