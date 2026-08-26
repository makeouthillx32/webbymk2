import { NextRequest, NextResponse } from "next/server";
import { recordStreamTelemetryAction, type StreamTelemetryBeacon } from "@/zones/tank/server/actions";

// Plain API route, deliberately NOT a Server Action called from the client.
// CameraPlayer.tsx's telemetry beacon fires every 30s per mounted camera
// player; calling a "use server" action directly from client code makes
// Next.js re-render and re-stream the ENTIRE current route's server
// component tree as part of the response, not just return data. Confirmed
// live via a HAR capture 2026-08-23: with several camera players open, that
// added up to ~50 full-page RSC re-renders in 80 seconds. This route calls
// the same recordStreamTelemetryAction server-side (a plain function call,
// no RSC wrapping) so the client only ever gets back a small JSON response.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as StreamTelemetryBeacon;
    const result = await recordStreamTelemetryAction(body);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
}
