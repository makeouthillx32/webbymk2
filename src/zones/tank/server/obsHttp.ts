import { NextResponse } from "next/server";
import {
  authorizePublish,
  getOrCreateMyObsRoom,
  rotateMyStreamKey,
  setObsRoomSignal,
  OBS_PATH_PREFIX,
} from "./obsRooms";

// Handlers kept out of app/ — zones/tank/src/app replaces src/app in the Tank
// image, so a zone route re-exporting "@/app/..." would recurse into itself.

/**
 * POST /api/tank/obs/auth — MediaMTX external authentication hook.
 *
 * MediaMTX posts every gated action here and treats HTTP 200 as "allow" and
 * anything else as "deny". Only `publish` is routed to us; read and playback
 * are excluded in mediamtx.yml so anonymous viewing never depends on Tank
 * being up.
 *
 * Reachable only container-to-container on the private `unenter` network.
 */
export async function handleObsAuth(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    // Deny on a malformed body. An auth hook that cannot read its input must
    // never fall through to "allow".
    return new NextResponse("invalid body", { status: 400 });
  }

  const result = await authorizePublish({
    path: typeof body?.path === "string" ? body.path : "",
    user: typeof body?.user === "string" ? body.user : "",
    password: typeof body?.password === "string" ? body.password : "",
    ip: typeof body?.ip === "string" ? body.ip : null,
    action: typeof body?.action === "string" ? body.action : "",
  });

  if (!result.allowed) {
    console.warn(`[obs-auth] denied ${body?.action} on '${body?.path}' from ${body?.ip}: ${result.reason}`);
    return new NextResponse(result.reason, { status: 401 });
  }

  return new NextResponse(null, { status: 200 });
}

/**
 * POST /api/tank/obs/signal — room lifecycle from MediaMTX.
 *
 * runOnReady fires when a stream starts arriving, runOnNotReady when it stops.
 * That is what makes a room appear on signal and disappear without it, rather
 * than lingering as a dead tile after someone closes OBS.
 */
export async function handleObsSignal(req: Request) {
  const expected = process.env.TANK_ARCHIVE_INGEST_SECRET;
  if (!expected) {
    return NextResponse.json({ success: false, error: "Not configured." }, { status: 503 });
  }
  if (req.headers.get("x-tank-ingest-secret") !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const path = typeof body?.path === "string" ? body.path : "";
  const live = body?.live === true || body?.live === "true";

  if (!path.startsWith(`${OBS_PATH_PREFIX}/`)) {
    return NextResponse.json({ success: false, error: "Not an OBS path." }, { status: 400 });
  }

  const slug = path.slice(OBS_PATH_PREFIX.length + 1);
  const ok = await setObsRoomSignal(slug, live, typeof body?.ip === "string" ? body.ip : null);

  return NextResponse.json({ success: ok, slug, live });
}

/** GET /api/tank/obs/room — the caller's own room and credentials. */
export async function handleMyObsRoom() {
  const result = await getOrCreateMyObsRoom();
  if (!result.success) {
    const error = "error" in result ? result.error : "OBS room unavailable.";
    return NextResponse.json({ success: false, error }, { status: 403 });
  }
  return NextResponse.json({ success: true, room: result.room });
}

/** POST /api/tank/obs/room — rotate the caller's stream key. */
export async function handleRotateStreamKey() {
  const result = await rotateMyStreamKey();
  if (!result.success) {
    const error = "error" in result ? result.error : "OBS room unavailable.";
    return NextResponse.json({ success: false, error }, { status: 403 });
  }
  return NextResponse.json({ success: true, room: result.room });
}
