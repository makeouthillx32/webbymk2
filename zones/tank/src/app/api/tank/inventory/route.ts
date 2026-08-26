import { NextResponse } from "next/server";
import { getCurrentUserInventory } from "@/zones/tank/server/gamification";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { inventory: await getCurrentUserInventory() },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}
