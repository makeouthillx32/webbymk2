import { NextResponse } from "next/server";
import {
  claimCaptures,
  recordOutcome,
} from "@/zones/tank/server/appearanceCaptureQueue";
import {
  describeTelemetry,
  isSubjectMode,
  recordServerAppearanceStatus,
  recordTelemetry,
  normaliseTelemetryReading,
} from "@/zones/tank/server/directorTelemetryStore";
import type { CameraTelemetryInput } from "@/zones/tank/server/directorVirtualAtlas";

// Where the detection layer delivers what it sees.
//
// HTTP rather than OSC on purpose. The TouchDesignerBridge component advertises
// OSC on 127.0.0.1:7000, but nothing in this stack ever listened for it — there
// is no UDP socket anywhere in the codebase, and adding one means a long-lived
// listener inside a Next.js container that survives neither rebuilds nor the
// serverless-ish request model cleanly. TouchDesigner can POST JSON from a
// Script CHOP in a few lines, it works across the Docker boundary without extra
// port plumbing, and it reuses the ingest-secret pattern the archive hook
// already proved.
//
// Detectors are containers, not people, so this is shared-secret authenticated.

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.TANK_ARCHIVE_INGEST_SECRET;
  // Fail closed: an unset secret must never mean "open". This endpoint steers
  // what every viewer sees.
  if (!secret) return false;
  return request.headers.get("x-tank-ingest-secret") === secret;
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept either a bare array or {cameras, mode} so a detector can drive the
  // subject mode too without a second call.
  const rawList = Array.isArray(body)
    ? body
    : Array.isArray(body?.cameras)
      ? body.cameras
      : null;
  if (!rawList) {
    return NextResponse.json(
      { error: "Expected an array of readings, or { cameras: [...] }" },
      { status: 400 },
    );
  }

  const inputs = rawList
    .map(normaliseTelemetryReading)
    .filter(Boolean) as CameraTelemetryInput[];
  if (inputs.length === 0) {
    return NextResponse.json(
      { error: "No readings carried a cameraId" },
      { status: 400 },
    );
  }

  const mode = isSubjectMode(body?.mode) ? body.mode : null;
  // "server": this route is the standalone-detector path (tank-vision-worker).
  // Recording the origin is what lets the operator console's browser detector
  // stand down while the worker is producing, instead of both decoding every
  // camera and overwriting each other's readings.
  // "learner" is the live identity service (services/tank-vision-gpu): it names
  // bodies from the operator's graded gallery and owns nothing else, so it is
  // stored as an overlay rather than as a reading. See directorTelemetryStore.
  const origin = body?.source === "learner" ? "learner" : "server";
  const stored = recordTelemetry(inputs, mode, origin);
  recordServerAppearanceStatus(body?.appearance);

  // Appearance-enrolment requests ride home on the telemetry response.
  //
  // The worker posts several times a second and is the only process holding
  // decoded frames, so this is both the lowest-latency channel to it and the
  // one that costs nothing: no extra socket, no second poll loop, no new
  // authentication surface. The alternative — a queue the worker polls on its
  // own timer — adds a request per pass to say "nothing" almost every time.
  const captures = claimCaptures();

  // And results travel back up the same pipe, so a failed capture is visible in
  // the console instead of being a click that appeared to do nothing.
  for (const result of Array.isArray(body?.captureResults)
    ? body.captureResults
    : []) {
    if (typeof result?.id !== "string") continue;
    recordOutcome(
      result.id,
      result.status === "captured" ? "captured" : "failed",
      typeof result.detail === "string" ? result.detail.slice(0, 300) : "",
    );
  }

  return NextResponse.json({ success: true, stored, mode, origin, captures });
}

/** Diagnostics — who is reporting, how stale, and whether the director trusts it. */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, ...describeTelemetry() });
}
