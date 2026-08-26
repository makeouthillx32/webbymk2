import { NextResponse } from "next/server";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { toPublicCameraDirectory } from "@/zones/tank/server/publicCameraProjection";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getCameraDirectorySnapshot();
  return NextResponse.json(
    toPublicCameraDirectory(snapshot),
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
