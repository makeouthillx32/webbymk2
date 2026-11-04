import { NextResponse } from "next/server";
import { getHouseCast } from "@/zones/tank/server/houseCastWorker";

// Where the house cast stands right now (live people -> alt director sprites).
// Public by the house's choice: sprite ids and floor positions, never footage.
// Updates arrive as `house_cast` broadcasts on tank:director:state; this is
// only the catch-up for a page that just loaded.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getHouseCast(), { headers: { "cache-control": "no-store" } });
}
