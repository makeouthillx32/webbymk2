import { NextResponse } from "next/server";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import {
  getEffectiveMode,
  getOperatorMode,
  setOperatorMode,
} from "@/zones/tank/server/directorTelemetryStore";
import type { SubjectMode } from "@/zones/tank/server/directorVirtualAtlas";

// Lets an operator choose what the director is looking for.
//
// Until now the subject mode could only arrive attached to a telemetry post,
// so the configuration screen could show nine modes while the live director
// respected none of them — picking "group" changed nothing. This is the
// control surface that makes the selection real.
//
// Staff-authenticated rather than shared-secret: a person is choosing this,
// not a detector, and it changes what every viewer sees.

export const dynamic = "force-dynamic";

const SUBJECT_MODES: SubjectMode[] = [
  "auto", "person", "speaker", "feet", "face", "motion", "crowd", "chaos", "manual",
];


export async function GET() {
  return NextResponse.json({
    success: true,
    operatorMode: getOperatorMode(),
    effectiveMode: getEffectiveMode(),
    available: SUBJECT_MODES,
  });
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) {
    return NextResponse.json({ error: "Staff only" }, { status: 403 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // null is a real choice: it hands control back to the detector's suggestion.
  const mode = body?.mode ?? null;
  if (mode !== null && !SUBJECT_MODES.includes(mode)) {
    return NextResponse.json(
      { error: `mode must be null or one of: ${SUBJECT_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  setOperatorMode(mode);
  return NextResponse.json({
    success: true,
    operatorMode: getOperatorMode(),
    effectiveMode: getEffectiveMode(),
  });
}
