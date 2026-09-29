import { NextResponse } from "next/server";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import {
  getRotationRoster,
  loadRotationRosterFromDb,
  persistRotationRosterToDb,
} from "@/zones/tank/server/directorRotationStore";
import {
  ROTATION_MAX_CAMERAS,
  ROTATION_MAX_INTERVAL_MS,
  ROTATION_MIN_INTERVAL_MS,
} from "@/zones/tank/server/rotationRoster";

// The rotation roster: which cameras the 24/7 director cycles, and for how long.
//
// This is the control surface that makes the configurator's Rotation Roster
// real. Before it, the roster lived in React state — setting it and refreshing
// lost it, and the server never saw it at all, so it rotated every camera on a
// hardcoded dwell regardless of what the operator had picked.
//
// GET matches /api/tank/director/mode: unauthenticated, because it is
// configuration the programme already reveals (you can see which cameras are in
// rotation by watching). POST is staff — it changes what every viewer sees.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const roster = await loadRotationRosterFromDb(true);
    return NextResponse.json({
      success: true,
      roster,
      limits: {
        minIntervalMs: ROTATION_MIN_INTERVAL_MS,
        maxIntervalMs: ROTATION_MAX_INTERVAL_MS,
        maxCameras: ROTATION_MAX_CAMERAS,
      },
      authority: "server-database",
    });
  } catch (error) {
    console.error("[DirectorRotation] Failed to read roster:", error);
    // The last known roster is still better than nothing for a console that is
    // about to render the picker.
    return NextResponse.json(
      { success: false, roster: getRotationRoster(), error: "Rotation roster unavailable" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Sanitised inside the store rather than here, so the HTTP path and the
    // database read path cannot disagree about what a valid roster is.
    const roster = await persistRotationRosterToDb(body, `${staff.role}:${staff.id}`);
    return NextResponse.json({ success: true, roster, authority: "server-database" });
  } catch (error) {
    console.error("[DirectorRotation] Failed to persist roster:", error);
    return NextResponse.json({ error: "Rotation roster was not saved" }, { status: 503 });
  }
}
