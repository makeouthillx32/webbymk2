import { NextRequest, NextResponse } from "next/server";
import { requestManagerCameraKeyframe } from "@/zones/tank/server/receiverManager";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, error: "Camera ID required" }, { status: 400 });
    }

    const success = await requestManagerCameraKeyframe(id);
    return NextResponse.json({ success, cameraId: id, requestedAt: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
