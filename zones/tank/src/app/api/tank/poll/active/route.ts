import { NextRequest, NextResponse } from "next/server";
import { getPublicActivePoll } from "@/zones/tank/server/pollSystem";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const poll = await getPublicActivePoll(
    request.headers.get("x-tank-voter-id") ?? undefined,
  );
  return NextResponse.json(
    { poll },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
