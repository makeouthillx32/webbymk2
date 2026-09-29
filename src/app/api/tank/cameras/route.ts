import { NextResponse } from "next/server";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { toPublicCameraDirectory } from "@/zones/tank/server/publicCameraProjection";
import { warmupServerDirector } from "@/zones/tank/server/serverDirectorEngine";

export const dynamic = "force-dynamic";

export async function GET() {
  // Ensure director is pre-warmed & compiling in background
  void warmupServerDirector().catch(() => {});

  const snapshot = await getCameraDirectorySnapshot();
  return NextResponse.json(
    toPublicCameraDirectory(snapshot),
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}
