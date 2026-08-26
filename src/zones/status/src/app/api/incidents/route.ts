import { NextResponse } from "next/server";
import incidentLedger from "../../../data/incidents.json";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(incidentLedger, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
