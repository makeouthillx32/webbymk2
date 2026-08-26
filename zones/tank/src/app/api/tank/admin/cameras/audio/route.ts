import { NextRequest, NextResponse } from "next/server";
import { requireAdminClient } from "@/lib/require-admin";
import { createClient } from "@/utils/supabase/server";
import { validateAudioAssignment } from "@/zones/tank/server/audioPolicy";
import {
  recordIngestEvent,
  saveCameraAudioAssignment,
} from "@/zones/tank/server/cameraRegistryDb";
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

  let body: {
    cameraId?: unknown;
    audioSourceId?: unknown;
    replaceNative?: unknown;
    confirmCrossRoom?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  if (typeof body.cameraId !== "string" || typeof body.audioSourceId !== "string") {
    return NextResponse.json(
      { error: "cameraId and audioSourceId are required." },
      { status: 400 },
    );
  }

  const snapshot = await getCameraDirectorySnapshot();
  const camera = snapshot.cameras.find((item) => item.id === body.cameraId);
  if (!camera) return NextResponse.json({ error: "Camera not found." }, { status: 404 });

  const source = body.audioSourceId === "self"
    ? null
    : snapshot.audioSources?.find((item) => item.id === body.audioSourceId) ?? null;
  if (body.audioSourceId !== "self" && !source) {
    return NextResponse.json({ error: "Audio source not found." }, { status: 404 });
  }

  const validation = validateAudioAssignment({
    camera,
    source,
    replaceNative: body.replaceNative === true,
    confirmCrossRoom: body.confirmCrossRoom === true,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: "error" in validation ? validation.error : "Audio assignment rejected." },
      { status: 409 },
    );
  }

  const saved = await saveCameraAudioAssignment({
    cameraId: camera.id,
    source,
    nativeAudioMuted: validation.nativeAudioMuted,
    crossRoomConfirmed: validation.crossRoomConfirmed,
  });
  if (!saved.success) {
    return NextResponse.json(
      { error: saved.error ?? "Audio assignment could not be persisted." },
      { status: 503 },
    );
  }

  await recordIngestEvent({
    cameraId: camera.id,
    eventType: "audio_track_assigned",
    details: {
      audioSourceId: source?.id ?? null,
      nativeAudioMuted: validation.nativeAudioMuted,
      crossRoomConfirmed: validation.crossRoomConfirmed,
    },
  });

  return NextResponse.json({
    success: true,
    cameraId: camera.id,
    audioSourceId: source?.id ?? null,
    audioSourceName: source?.name ?? null,
    nativeAudioMuted: validation.nativeAudioMuted,
    crossRoomConfirmed: validation.crossRoomConfirmed,
  });
}
