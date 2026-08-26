import { NextResponse } from "next/server";
import {
  browsableDays,
  conversionCutoffDate,
  findSegmentsToConvert,
  markSegmentConverted,
} from "@/zones/tank/server/archiveTranscode";

// Control surface for the AV1 converter that runs inside unt_mediamtx.
//
// The converter lives there because that is the only container with ffmpeg and
// the GPU. It cannot reach the database, so it asks this route what to work on
// and reports back — the same shape as the recording hook, and for the same
// reason: keep credentials and schema knowledge on the app side.
//
// Shared-secret auth, not user auth: the caller is a container, and this must
// keep working with nobody signed in.

export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = process.env.TANK_ARCHIVE_INGEST_SECRET;
  // Fail closed. An unset secret must not mean "let everyone in" — this route
  // can rewrite archive rows.
  if (!secret) return false;
  return request.headers.get("x-tank-ingest-secret") === secret;
}

/** What should be converted next. */
export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit")) || 3;
  const segments = await findSegmentsToConvert(limit);

  return NextResponse.json({
    success: true,
    browsableDays: browsableDays(),
    cutoffDate: conversionCutoffDate(),
    segments,
  });
}

/** Report a finished conversion. */
export async function POST(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  const size = Number(body?.fileSizeBytes);

  // A zero or missing size means the converter could not confirm the output.
  // Refuse rather than mark a segment av1 that might not be playable.
  if (!id || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json(
      { error: "id and a positive fileSizeBytes are required" },
      { status: 400 },
    );
  }

  const result = await markSegmentConverted(id, size);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
