// Server-only utilities (see archiveDrain.ts for why there is no "use server"
// directive here). If any of these ever needs calling straight from a client
// component, wrap it in server/actions.ts rather than adding the directive.
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { ARCHIVE_BUCKET } from "../mediaPlayback";

// The continuous room archive: one row per finished MediaMTX recording segment.
//
// Tiering, and why the row survives the bytes moving:
//   hot     bytes are in Supabase Storage, servable to members via signed URL
//   cold    bytes were drained to mass storage; the row is the only index left
//   expired bytes are gone from both; the row is a tombstone so the timeline
//           still shows that footage existed and when, rather than a silent gap
//
// See mediamtx/scripts/on-segment-complete.sh for the producer side.

export type ArchiveTier = "hot" | "cold" | "expired";

export type ArchiveSegment = {
  id: string;
  cameraId: string;
  roomSlug: string;
  seasonSlug: string;
  recordedDate: string;
  segmentStart: string;
  segmentEnd: string | null;
  durationSeconds: number;
  tier: ArchiveTier;
  storagePath: string | null;
  coldPath: string | null;
  fileSizeBytes: number;
  /**
   * Codec of the stored file. Segments record as h264 so they play everywhere,
   * then convert to av1 once past the browsable window. The UI needs this to
   * warn viewers whose device cannot decode AV1 — otherwise older phones get a
   * silent black player with no explanation.
   */
  codec: "h264" | "av1";
};

export type SegmentIngestInput = {
  cameraId: string;
  storagePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  segmentStart: string;
  fileName?: string;
};

function mapRow(row: Record<string, any>): ArchiveSegment {
  return {
    id: row.id,
    cameraId: row.camera_id,
    roomSlug: row.room_slug,
    seasonSlug: row.season_slug,
    recordedDate: row.recorded_date,
    segmentStart: row.segment_start,
    segmentEnd: row.segment_end,
    durationSeconds: row.duration_seconds ?? 0,
    tier: row.tier as ArchiveTier,
    storagePath: row.storage_path,
    coldPath: row.cold_path,
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    codec: row.codec === "av1" ? "av1" : "h264",
  };
}

/**
 * Records a finished segment. Called only by the MediaMTX hook through
 * /api/tank/archive/segment-complete, which authenticates the shared secret —
 * this function assumes it is already trusted and uses the admin client.
 *
 * Idempotent on (camera_id, segment_start): the hook can retry freely, and a
 * MediaMTX restart that re-fires a completed segment updates rather than
 * duplicating.
 */
export async function ingestArchiveSegment(
  input: SegmentIngestInput,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();

  if (
    input.storagePath?.includes("tank-loops") ||
    input.storagePath?.includes("preroll") ||
    input.storagePath?.startsWith("loops/") ||
    input.fileName?.includes("preroll") ||
    input.fileName?.includes("loop") ||
    (input.durationSeconds && input.durationSeconds < 10)
  ) {
    return {
      success: false,
      error: "Loops, prerolls, and sub-10s connecting clips are strictly disqualified from 24-hour archive material.",
    };
  }

  // The camera's room comes from the registry, not the hook — the media layer
  // knows nothing about rooms, and denormalising it here is what makes
  // "show me this room's day" a single indexed query later.
  let roomSlug = "all-rooms";
  try {
    const { data: cam } = await admin
      .from("tank_camera_registry")
      .select("room_scope")
      .eq("camera_id", input.cameraId)
      .maybeSingle();
    if (cam?.room_scope) roomSlug = cam.room_scope;
  } catch {}

  const start = new Date(input.segmentStart);
  if (Number.isNaN(start.getTime())) {
    return { success: false, error: "Invalid segmentStart." };
  }
  const end = new Date(start.getTime() + Math.max(0, input.durationSeconds) * 1000);

  const { data, error } = await admin
    .from("tank_archive_segments")
    .upsert(
      {
        camera_id: input.cameraId,
        room_slug: roomSlug,
        recorded_date: start.toISOString().slice(0, 10),
        segment_start: start.toISOString(),
        segment_end: end.toISOString(),
        duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
        tier: "hot",
        storage_bucket: ARCHIVE_BUCKET,
        storage_path: input.storagePath,
        file_size_bytes: Math.max(0, Math.round(input.fileSizeBytes)),
        metadata: input.fileName ? { fileName: input.fileName } : {},
      },
      { onConflict: "camera_id,segment_start" },
    )
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data?.id };
}

/**
 * A member's view of one room's footage for a given day.
 *
 * Uses the request-scoped client on purpose: RLS on tank_archive_segments
 * requires auth.uid(), so a signed-out visitor gets an empty list from the
 * database itself rather than from a check we remembered to write here.
 */
export async function getRoomArchiveDay(
  roomSlug: string,
  isoDate: string,
): Promise<ArchiveSegment[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tank_archive_segments")
      .select("*")
      .eq("room_slug", roomSlug)
      .eq("recorded_date", isoDate)
      .neq("tier", "expired")
      .order("segment_start", { ascending: true })
      .limit(500);

    if (error || !data) return [];
    return data.map(mapRow);
  } catch {
    return [];
  }
}

export type SignedSegment = ArchiveSegment & { playbackUrl: string | null };

/**
 * Mints short-lived signed URLs for hot segments.
 *
 * tank-archives is a PRIVATE bucket — footage is for allowed members only, so
 * there is no public URL to hand out. Cold segments deliberately return null:
 * their bytes are on mass storage and Supabase genuinely cannot serve them, and
 * saying so beats returning a URL that 404s.
 */
export async function signArchiveSegments(
  segments: ArchiveSegment[],
  _expiresInSeconds = 3600,
): Promise<SignedSegment[]> {
  // Archives are served off the archive disk by /api/tank/archive/file/[id],
  // not by Supabase Storage. Putting an unbounded, always-growing dataset in
  // Storage meant it lived inside Docker's virtual disk on C:, which grows on
  // every write and never shrinks on delete — a night of recording took the
  // host to 5% free and brought the stack down.
  //
  // There is nothing to pre-sign as a result: the route authorises each request
  // against the same RLS-scoped row the caller can already see, so a URL is
  // only useful to someone who could read the segment anyway. That also means
  // links no longer expire mid-playback, which signed URLs did on long footage.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return segments.map((s) => ({ ...s, playbackUrl: null }));

  return segments.map((s) => ({
    ...s,
    // Anything already drained off this host has no local file to stream.
    playbackUrl:
      s.tier !== "expired" && (s.storagePath || s.coldPath)
        ? `/api/tank/archive/file/${s.id}`
        : null,
  }));
}

