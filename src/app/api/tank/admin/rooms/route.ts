import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { saveRoomPresentation } from "@/zones/tank/server/cameraRegistryDb";
import type { RoomVisibilityPolicy } from "@/zones/tank/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const snapshot = await getCameraDirectorySnapshot();
  return NextResponse.json(
    {
      ok: true,
      rooms: snapshot.rooms,
      // Names + roomScope only — admins pick a room's audio input from
      // this, no need for full camera telemetry here.
      cameras: snapshot.cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        roomScope: camera.roomScope,
      })),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const { roomKey, title, eyebrow, description, tags, visibilityPolicy, audioInputSourceId } =
    (body ?? {}) as Record<string, unknown>;
  if (typeof roomKey !== "string" || !roomKey.trim()) {
    return NextResponse.json({ error: "roomKey is required." }, { status: 400 });
  }
  if (visibilityPolicy !== null && visibilityPolicy !== "always-show" && visibilityPolicy !== "live-only") {
    return NextResponse.json({ error: "visibilityPolicy must be always-show, live-only, or null." }, { status: 400 });
  }
  if (audioInputSourceId !== undefined && audioInputSourceId !== null && typeof audioInputSourceId !== "string") {
    return NextResponse.json({ error: "audioInputSourceId must be a string or null." }, { status: 400 });
  }

  const result = await saveRoomPresentation({
    roomKey: roomKey.trim(),
    title: typeof title === "string" ? title : "",
    eyebrow: typeof eyebrow === "string" ? eyebrow : "",
    description: typeof description === "string" ? description : "",
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
    visibilityPolicy: visibilityPolicy as RoomVisibilityPolicy | null,
    ...(audioInputSourceId !== undefined
      ? { audioInputSourceId: audioInputSourceId as string | null }
      : {}),
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to save room presentation." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
