import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient } from "@/lib/require-admin";
import { createClient } from "@/utils/supabase/server";
import { requiresBrowserAudioWorker } from "@/zones/tank/server/audioPolicy";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const access = await requireAdminClient(supabase);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status },
    );
  }

  let cameraId: unknown;
  try {
    cameraId = (await request.json() as { cameraId?: unknown }).cameraId;
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  if (typeof cameraId !== "string" || !cameraId.trim()) {
    return NextResponse.json({ error: "cameraId is required." }, { status: 400 });
  }

  const normalizedCameraId = cameraId.trim();
  const snapshot = await getCameraDirectorySnapshot();
  const camera = snapshot.cameras.find((item) => item.id === normalizedCameraId);
  if (!camera) {
    return NextResponse.json({ error: "Camera not found." }, { status: 404 });
  }
  if (requiresBrowserAudioWorker(camera.audioStatus)) {
    return NextResponse.json(
      {
        error:
          camera.audioStatus === "transcode-required"
            ? "Browser audio transcode output is required before MediaMTX provisioning."
            : camera.audioStatus === "external-ready"
              ? "External audio must be combined with video before MediaMTX provisioning."
              : "Automatic audio probing must resolve before MediaMTX provisioning.",
        cameraId: camera.id,
        audioStatus: camera.audioStatus,
      },
      { status: 503 },
    );
  }

  // Reading the directory schedules idempotent MediaMTX provisioning for
  // every enabled online camera. This endpoint confirms the selected camera's
  // resolved public playback contract without reconstructing or exposing its
  // private SRT source URL.
  return NextResponse.json({
    ok: true,
    cameraId: camera.id,
    playbackUrl: camera.playbackUrl,
    playbackProtocol: camera.playbackProtocol,
  }, {
    status: 200,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
