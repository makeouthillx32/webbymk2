import { NextResponse } from "next/server";
import { getPublicActivePoll } from "@/zones/tank/server/pollSystem";

export const dynamic = "force-dynamic";

export async function GET() {
  const poll = await getPublicActivePoll();
  return NextResponse.json(
    { poll },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
