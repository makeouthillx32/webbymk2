import { NextResponse } from "next/server";
import { getArchiveFilters, getArchiveRecordings } from "@/zones/tank/server/archiveDb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const season = searchParams.get("season") || undefined;
  const room = searchParams.get("room") || undefined;
  const day = searchParams.get("day") || undefined;
  const includeFilters = searchParams.get("filters") === "true";

  try {
    const recordings = await getArchiveRecordings({ season, room, day });
    const filters = includeFilters ? await getArchiveFilters() : undefined;

    return NextResponse.json({
      success: true,
      query: { season: season || "all", room: room || "all-rooms", day: day || null },
      recordings,
      ...(filters ? { filters } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}
