import { NextResponse } from "next/server";
import { requireStaff } from "./staffAuth";
import {
  getFreshTelemetry,
  normaliseTelemetryReading,
  recordTelemetry,
} from "./directorTelemetryStore";
import type { CameraTelemetryInput, SubjectMode } from "./directorVirtualAtlas";

const SUBJECT_MODES: SubjectMode[] = [
  "auto",
  "person",
  "speaker",
  "feet",
  "face",
  "motion",
  "crowd",
  "chaos",
  "manual",
];

export async function handleDirectorTelemetryLiveGet() {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });
  return NextResponse.json({ success: true, telemetry: getFreshTelemetry() });
}

export async function handleDirectorTelemetryLivePost(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "No readings carried a cameraId" }, { status: 400 });
  }

  const mode = SUBJECT_MODES.includes(body?.mode) ? (body.mode as SubjectMode) : null;
  const stored = recordTelemetry(inputs, mode);
  return NextResponse.json({ success: true, stored, mode });
}

export async function handleDirectorTelemetrySimulatePost(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cameras = Array.isArray(body?.cameras)
    ? (body.cameras as CameraTelemetryInput[])
    : null;
  if (!cameras) {
    return NextResponse.json({ error: "Expected { cameras: [...] }" }, { status: 400 });
  }

  const mode: SubjectMode | undefined =
    typeof body?.mode === "string" ? body.mode : undefined;
  const stored = recordTelemetry(cameras, mode);
  return NextResponse.json({ success: true, stored });
}
