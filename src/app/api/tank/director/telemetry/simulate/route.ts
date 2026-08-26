import { NextResponse } from "next/server";
import { requireStaff } from "@/zones/tank/server/staffAuth";
import { recordTelemetry } from "@/zones/tank/server/directorTelemetryStore";
import type { CameraTelemetryInput, SubjectMode } from "@/zones/tank/server/directorVirtualAtlas";

// The director configuration screen's own detection simulator posts here.
//
// Deliberately NOT the shared-secret ingest route a real detector uses. That
// route's secret is server-only for good reason — it must never reach the
// browser bundle — so a browser-side control needs its own door. Staff
// session gated instead: a person clicking "simulate" in the console they are
// already signed into is a different trust boundary than a detector
// container, and conflating the two would mean either leaking the detector
// secret to the client or gating a debug toggle behind infrastructure meant
// for machines.

export const dynamic = "force-dynamic";


export async function POST(request: Request) {
  const staff = await requireStaff();
  if (!staff) return NextResponse.json({ error: "Staff only" }, { status: 403 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const cameras = Array.isArray(body?.cameras) ? (body.cameras as CameraTelemetryInput[]) : null;
  if (!cameras) return NextResponse.json({ error: "Expected { cameras: [...] }" }, { status: 400 });

  const mode: SubjectMode | undefined = typeof body?.mode === "string" ? body.mode : undefined;
  const stored = recordTelemetry(cameras, mode);
  return NextResponse.json({ success: true, stored });
}
