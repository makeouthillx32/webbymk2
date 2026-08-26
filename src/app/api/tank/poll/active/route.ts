import { NextRequest, NextResponse } from "next/server";
import { getPublicActivePoll } from "@/zones/tank/server/pollSystem";

// Plain API route, not a Server Action called from the client. Both
// PollOverlay.tsx polls for the active poll every 4s via setInterval;
// calling getActivePoll() (a "use server" export)
// directly from client code forces Next.js to re-render and re-stream the
// ENTIRE page's server component tree on every tick, from BOTH components
// simultaneously if mounted together. Confirmed live 2026-08-23 via a HAR
// capture: this was the actual source of a cascading render loop producing
// tens of requests per second (~10-25ms apart) once this code path started
// running for the first time (PollOverlay.tsx had a pre-existing syntax
// error blocking the build until moments before this was found). Same fix
// pattern as recordStreamTelemetryAction -> /api/tank/stream-telemetry.
export async function GET(request: NextRequest) {
  const poll = await getPublicActivePoll(
    request.headers.get("x-tank-voter-id") ?? undefined,
  );
  return NextResponse.json({ poll });
}
