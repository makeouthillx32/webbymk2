import { NextResponse } from "next/server";
import {
  describeTelemetry,
  recordTelemetry,
  normaliseTelemetryReading,
} from "@/zones/tank/server/directorTelemetryStore";
import type { CameraTelemetryInput, SubjectMode } from "@/zones/tank/server/directorVirtualAtlas";

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

const SUBJECT_MODES: SubjectMode[] = [
  "auto", "person", "speaker", "feet", "face", "motion", "crowd", "chaos", "manual",
];

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
  const rawList = Array.isArray(body) ? body : Array.isArray(body?.cameras) ? body.cameras : null;
  if (!rawList) {
    return NextResponse.json(
      { error: "Expected an array of readings, or { cameras: [...] }" },
      { status: 400 },
    );
  }

  const inputs = rawList.map(normaliseTelemetryReading).filter(Boolean) as CameraTelemetryInput[];
  if (inputs.length === 0) {
    return NextResponse.json({ error: "No readings carried a cameraId" }, { status: 400 });
  }

  const mode = SUBJECT_MODES.includes(body?.mode) ? (body.mode as SubjectMode) : null;
  const stored = recordTelemetry(inputs, mode);

  return NextResponse.json({ success: true, stored, mode });
}

/** Diagnostics — who is reporting, how stale, and whether the director trusts it. */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ success: true, ...describeTelemetry() });
}
