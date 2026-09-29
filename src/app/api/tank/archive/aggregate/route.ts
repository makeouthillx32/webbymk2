import { NextResponse } from "next/server";
import {
  aggregateAllPendingDays,
  aggregateCompletedDay,
  getPendingAggregationDays,
  recordDailyArchiveMaster,
} from "@/zones/tank/server/archiveAggregate";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = request.headers.get("x-tank-ingest-secret");
  const expected = process.env.TANK_ARCHIVE_INGEST_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await getPendingAggregationDays();
  return NextResponse.json({ success: true, count: pending.length, pending });
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-tank-ingest-secret");
  const expected = process.env.TANK_ARCHIVE_INGEST_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  // If worker reported a finished concatenated master file directly
  if (body.roomSlug && body.recordedDate && body.storagePath) {
    const res = await recordDailyArchiveMaster({
      roomSlug: body.roomSlug,
      recordedDate: body.recordedDate,
      seasonSlug: body.seasonSlug,
      storagePath: body.storagePath,
      fileSizeBytes: Number(body.fileSizeBytes) || 0,
      durationSeconds: Number(body.durationSeconds) || 0,
      segmentCount: Number(body.segmentCount) || 0,
    });
    return NextResponse.json(res);
  }

  if (body.roomSlug && body.recordedDate) {
    const result = await aggregateCompletedDay(body.roomSlug, body.recordedDate, body.seasonSlug || "s01");
    return NextResponse.json(result);
  }

  const results = await aggregateAllPendingDays();
  return NextResponse.json({ success: true, count: results.length, results });
}

