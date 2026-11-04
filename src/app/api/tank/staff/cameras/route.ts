import { NextResponse } from "next/server";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { toStaffCameraDirectory } from "@/zones/tank/server/publicCameraProjection";
import { checkStaff, staffDenialResponse } from "@/zones/tank/server/staffAuth";

export const dynamic = "force-dynamic";

// The house console's camera directory: everything /api/tank/cameras has, plus
// the rooms switched off for Tank (tagged offAir) and their cameras. Off for
// Tank means hidden from viewers, not dead to staff.
export async function GET() {
  const check = await checkStaff();
  if (!check.staff) {
    const denied = staffDenialResponse(check.denial);
    return NextResponse.json(denied.body, { status: denied.status });
  }
  const snapshot = await getCameraDirectorySnapshot();
  return NextResponse.json(toStaffCameraDirectory(snapshot), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
