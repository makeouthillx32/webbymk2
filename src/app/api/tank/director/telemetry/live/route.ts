import { NextResponse } from "next/server";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import {
  getFreshTelemetry,
  recordTelemetry,
  normaliseTelemetryReading,
} from "@/zones/tank/server/directorTelemetryStore";
import type { CameraTelemetryInput, SubjectMode } from "@/zones/tank/server/directorVirtualAtlas";

// What the director configuration screen actually watches — and, via POST,
// what feeds it.
//
// The ingest route's GET/POST are for an external detector (TouchDesigner, a
// standalone process) and are shared-secret gated. This pair is for a staff
// member's own authenticated browser tab acting as the detector — the
// director-configuration page runs real person detection against the video
// elements already rendered there and posts readings here directly, with no
// server secret ever touching client code. Split out rather than overloading
// one route with two audiences and two auth schemes.

export const dynamic = "force-dynamic";

const SUBJECT_MODES: SubjectMode[] = [
  "auto", "person", "speaker", "feet", "face", "motion", "crowd", "chaos", "manual",
];

export async function GET() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  return NextResponse.json({ success: true, telemetry: getFreshTelemetry() });
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
