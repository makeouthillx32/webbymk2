import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { listPendingAudioRequests, moderateAudioRequest } from "@/zones/tank/server/audioRequests";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const requests = await listPendingAudioRequests();
  return NextResponse.json(
    { ok: true, requests },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON body is required." }, { status: 400 });
  }

  const { requestId, decision } = (body ?? {}) as Record<string, unknown>;
  if (typeof requestId !== "string" || !requestId.trim()) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ error: "decision must be approve or reject." }, { status: 400 });
  }

  const result = await moderateAudioRequest(requestId.trim(), decision);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Failed to moderate request." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
