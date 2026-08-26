import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ingestArchiveSegment } from "./archiveSegments";
import { drainAgedSegments, enforceHotStorageBudget, getArchiveStorageReport } from "./archiveDrain";
import { getArchiveBrowseData } from "./archiveBrowse";

// Request handlers for the archive endpoints, kept OUT of any app/ directory.
//
// Tank ships its own app dir (zones/tank/src/app) which REPLACES src/app in the
// zone image — so a zone route that re-exports from "@/app/..." resolves back to
// itself and recurses until the stack blows. Both route surfaces therefore
// import from here, under src/zones/, which is shared by construction.

/**
 * Staff, or the shared ingest secret so an unattended timer can call in.
 * Used by the drain, which deletes footage after copying it.
 */
async function isStaffOrIngestSecret(req: Request): Promise<boolean> {
  const secret = process.env.TANK_ARCHIVE_INGEST_SECRET;
  if (secret && req.headers.get("x-tank-ingest-secret") === secret) return true;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return profile?.role === "admin" || profile?.role === "moderator";
  } catch {
    return false;
  }
}

/**
 * POST /api/tank/archive/segment-complete
 *
 * Called by mediamtx/scripts/on-segment-complete.sh once a recording segment
 * has been uploaded to Supabase Storage. Container-to-container on the private
 * `unenter` network, authenticated by a shared secret — it writes to the
 * archive index with service-role rights, so it must never be open.
 */
export async function handleSegmentComplete(req: Request) {
  const expected = process.env.TANK_ARCHIVE_INGEST_SECRET;

  // Fail closed: an unset secret disables the endpoint rather than leaving it
  // unauthenticated.
  if (!expected) {
    return NextResponse.json(
      { success: false, error: "Archive ingest is not configured." },
      { status: 503 },
    );
  }

  if (req.headers.get("x-tank-ingest-secret") !== expected) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { cameraId, storagePath, fileSizeBytes, durationSeconds, segmentStart, fileName } = body ?? {};

  if (typeof cameraId !== "string" || !cameraId.trim()) {
    return NextResponse.json({ success: false, error: "cameraId is required." }, { status: 400 });
  }
  if (typeof storagePath !== "string" || !storagePath.trim()) {
    return NextResponse.json({ success: false, error: "storagePath is required." }, { status: 400 });
  }
  if (typeof segmentStart !== "string" || !segmentStart.trim()) {
    return NextResponse.json({ success: false, error: "segmentStart is required." }, { status: 400 });
  }

  const result = await ingestArchiveSegment({
    cameraId: cameraId.trim(),
    storagePath: storagePath.trim(),
    fileSizeBytes: Number(fileSizeBytes) || 0,
    durationSeconds: Number(durationSeconds) || 0,
    segmentStart: segmentStart.trim(),
    fileName: typeof fileName === "string" ? fileName : undefined,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: result.id });
}

/** GET /api/tank/archive/drain — tier accounting. Read-only. */
export async function handleDrainReport(req: Request) {
  if (!(await isStaffOrIngestSecret(req))) {
    return NextResponse.json({ success: false, error: "Staff only." }, { status: 403 });
  }
  return NextResponse.json({ success: true, ...(await getArchiveStorageReport()) });
}

/** POST /api/tank/archive/drain — run a bounded drain pass. */
export async function handleDrainRun(req: Request) {
  if (!(await isStaffOrIngestSecret(req))) {
    return NextResponse.json({ success: false, error: "Staff only." }, { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional — an empty POST means "drain with defaults".
  }

  // hotWindowHours must pass through exactly, including 0 ("drain everything").
  // `Number(x) || undefined` would convert that 0 into the default window.
  const requestedWindow = Number(body?.hotWindowHours);
  // Reclaim first when a byte budget is set. With no cold target the drain
  // cannot free anything, and that is exactly when the disk is at risk.
  const budget = await enforceHotStorageBudget();

  const report = await drainAgedSegments({
    hotWindowHours:
      Number.isFinite(requestedWindow) && requestedWindow >= 0 ? requestedWindow : undefined,
    limit: Math.min(Number(body?.limit) || 50, 200),
  });

  return NextResponse.json({ success: !report.error, ...report, budget });
}

/**
 * GET /api/tank/archive/browse?season=s01&room=bedroom-1&date=YYYY-MM-DD
 *
 * Powers the Archives page. Every read underneath goes through the
 * request-scoped Supabase client, so RLS — not a check written here — is what
 * keeps footage members-only. A signed-out visitor gets the season/room lists
 * (harmless structure) and no days or segments.
 */
export async function handleArchiveBrowse(req: Request) {
  const { searchParams } = new URL(req.url);

  const data = await getArchiveBrowseData({
    season: searchParams.get("season") || undefined,
    room: searchParams.get("room") || undefined,
    date: searchParams.get("date") || undefined,
  });

  let isMember = false;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    isMember = Boolean(user);
  } catch {}

  return NextResponse.json({ success: true, isMember, ...data });
}
