import { NextResponse } from "next/server";
import { getCameraDirectorySnapshot } from "@/zones/tank/server/receiverManager";
import { cameraMediaPath, readMediaMtxPathHealth } from "@/zones/tank/server/mediaGateway";
import {
  cameraPreviewMediaPath,
  obsRoomMediaPath,
  obsRoomPreviewMediaPath,
} from "@/zones/tank/mediaPlayback";
import { OBS_PATH_PREFIX } from "@/zones/tank/server/obsRooms";

export const dynamic = "force-dynamic";

// The return half of the SRT manager <-> Tank link. receiverManager.ts
// already pulls the manager's telemetry one direction (native bridge
// restarts, receive rate, etc). This is the only way for the manager to
// learn whether MediaMTX is actually RECEIVING bytes for a camera — the one
// signal that's true no matter where the pipeline broke, including a
// player-attach failure on the manager's own SRTLA relay (confirmed live
// 2026-08-23 on the IRL room: SLS's player socket went null while the
// publisher side reported a perfectly healthy bonded connection, so
// app.js's existing "publisher receive rate stuck at 0" detector in
// pollAutomaticRecovery never fired). Shared-secret auth, not user auth:
// the caller is a native process on the host, not a signed-in browser.
function authorised(request: Request): boolean {
  const secret = process.env.TANK_ARCHIVE_INGEST_SECRET;
  if (!secret) return false;
  return request.headers.get("x-tank-ingest-secret") === secret;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiBase = process.env.MEDIAMTX_API_URL;
  if (!apiBase) {
    return NextResponse.json({ error: "MEDIAMTX_API_URL is not configured." }, { status: 500 });
  }
  const apiUrl = new URL(apiBase);

  const snapshot = await getCameraDirectorySnapshot();
  const cameras = await Promise.all(
    snapshot.cameras.map(async (camera) => {
      // OBS rooms don't live at cameras/<id> at all — they're obs/<slug>,
      // and the delivery-relevant path is the -whep sibling
      // (provisionObsWhepSibling), not the raw OBS-published base. This
      // endpoint always checked cameras/<id> unconditionally, which for
      // every obs-* id just reads a path that has never existed —
      // confirmed live 2026-08-24 while chasing a real "no footage"
      // report on the OBS room, where this returned a permanently
      // meaningless not-ready/0-bytes result instead of the truth.
      const path = camera.id.startsWith(`${OBS_PATH_PREFIX}-`)
        ? `${obsRoomMediaPath(camera.slug)}-whep`
        : cameraMediaPath(camera.id);
      const previewPath = camera.previewUrl
        ? camera.id.startsWith(`${OBS_PATH_PREFIX}-`)
          ? obsRoomPreviewMediaPath(camera.slug)
          : cameraPreviewMediaPath(camera.id)
        : null;
      const [health, previewHealth] = await Promise.all([
        readMediaMtxPathHealth(apiUrl, path),
        previewPath ? readMediaMtxPathHealth(apiUrl, previewPath) : Promise.resolve(null),
      ]);
      return {
        id: camera.id,
        path,
        ready: health?.ready ?? false,
        bytesReceived: health?.bytesReceived ?? 0,
        previewPath,
        previewReady: previewHealth?.ready ?? false,
        previewBytesReceived: previewHealth?.bytesReceived ?? 0,
      };
    }),
  );

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), cameras },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
