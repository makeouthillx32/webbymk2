import { NextResponse } from "next/server";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getCameraDirectorySnapshot();
  const publicCameras = snapshot.cameras
    .filter((camera) => camera.publicVisible)
    .map(({ keyFingerprint: _credentialFingerprint, ...camera }) => camera);
  return NextResponse.json(
    {
      ...snapshot,
      cameras: publicCameras,
    },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
