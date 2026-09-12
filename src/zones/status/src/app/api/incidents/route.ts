import { NextResponse } from "next/server";
import { fetchIncidentHistory } from "../../../lib/incidents";

export const dynamic = "force-dynamic";

export async function GET() {
  const incidents = await fetchIncidentHistory();
  return NextResponse.json({ incidents, generatedAt: new Date().toISOString() }, {
    headers: { "Cache-Control": "public, max-age=30, s-maxage=30, stale-while-revalidate=120" },
  });
}
