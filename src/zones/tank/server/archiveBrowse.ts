// Read model behind the Archives browser (season → room → date → footage).
//
// Server-only utilities, no "use server" directive — see archiveDrain.ts.
import { createClient } from "@/utils/supabase/server";
import { getRoomArchiveDay, signArchiveSegments, type SignedSegment } from "./archiveSegments";

// Rooms that exist in tank_rooms but are not physical camera rooms, so they
// must never appear in an archive room picker. `global` is the chat scope.
const NON_CAMERA_ROOMS = new Set(["global"]);

export type ArchiveSeasonOption = { slug: string; name: string; startsAt: string; endsAt: string | null };
export type ArchiveRoomOption = { slug: string; name: string };

export type ArchiveDay = {
  /** YYYY-MM-DD */
  date: string;
  /** False when this day has no footage — rendered but not selectable. */
  hasFootage: boolean;
  segmentCount: number;
  /** Total recorded seconds for the room that day. */
  totalSeconds: number;
  /**
   * The day is over, so nothing more will be added. Today is still
   * accumulating, which is a different thing to show than a short day — one is
   * unfinished, the other is all there ever was.
   */
  isComplete: boolean;
  /** At least one segment is still hot; a fully drained day cannot stream. */
  isStreamable: boolean;
  totalBytes: number;
};

export type ArchiveBrowseData = {
  seasons: ArchiveSeasonOption[];
  rooms: ArchiveRoomOption[];
  days: ArchiveDay[];
  segments: SignedSegment[];
};

function seasonSlug(number: number): string {
  return `s${String(number).padStart(2, "0")}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getArchiveSeasons(): Promise<ArchiveSeasonOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tank_seasons")
      .select("number, name, starts_at, ends_at")
      .order("number", { ascending: true });

    return (data ?? []).map((s: any) => ({
      slug: seasonSlug(s.number),
      name: s.name || `Season ${s.number}`,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
    }));
  } catch {
    return [];
  }
}

export async function getArchiveRooms(): Promise<ArchiveRoomOption[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("tank_rooms")
      .select("slug, title")
      .order("slug", { ascending: true });

    return (data ?? [])
      .filter((r: any) => r.slug && !NON_CAMERA_ROOMS.has(r.slug))
      .map((r: any) => ({ slug: r.slug, name: r.title || r.slug }));
  } catch {
    return [];
  }
}

/**
 * Every calendar day in the season, each flagged with whether footage exists.
 *
 * The strip deliberately shows the whole season rather than only days that
 * recorded: a gap is information ("the cameras were down that day"), and a
 * picker that silently omits dates makes missing footage look like it was never
 * supposed to be there. Days without footage render disabled.
 */
export async function getArchiveDays(
  season: ArchiveSeasonOption | undefined,
  roomSlug: string,
): Promise<ArchiveDay[]> {
  if (!season) return [];

  const start = new Date(season.startsAt);
  if (Number.isNaN(start.getTime())) return [];

  // An open-ended (current) season runs to today, not forever.
  const rawEnd = season.endsAt ? new Date(season.endsAt) : new Date();
  const end = Number.isNaN(rawEnd.getTime()) ? new Date() : rawEnd;

  // One row per day from the roll-up view rather than every segment row for
  // the whole season — a busy room is ~144 segments/day, so scanning them just
  // to count days got expensive fast. The view also carries duration and
  // completeness, which the strip needs anyway.
  const summaries = new Map<string, {
    segmentCount: number;
    totalSeconds: number;
    isComplete: boolean;
    isStreamable: boolean;
    totalBytes: number;
  }>();
  try {
    const supabase = await createClient();
    // RLS is inherited by the view, so a signed-out visitor gets nothing here
    // for the same reason they get nothing from the segments table.
    const { data } = await supabase
      .from("tank_archive_days")
      .select("recorded_date, segment_count, total_seconds, is_complete, is_streamable, total_bytes")
      .eq("room_slug", roomSlug)
      .limit(1000);

    for (const row of data ?? []) {
      const d = (row as any).recorded_date as string;
      if (!d) continue;
      summaries.set(d, {
        segmentCount: Number((row as any).segment_count) || 0,
        totalSeconds: Number((row as any).total_seconds) || 0,
        isComplete: Boolean((row as any).is_complete),
        isStreamable: Boolean((row as any).is_streamable),
        totalBytes: Number((row as any).total_bytes) || 0,
      });
    }
  } catch {
    // Fall through: the strip still renders, every day just shows as empty.
  }

  const days: ArchiveDay[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

  // Guard against a misconfigured season producing an unbounded loop.
  let guard = 0;
  while (cursor <= last && guard < 800) {
    const key = isoDate(cursor);
    const summary = summaries.get(key);
    days.push({
      date: key,
      hasFootage: (summary?.segmentCount ?? 0) > 0,
      segmentCount: summary?.segmentCount ?? 0,
      totalSeconds: summary?.totalSeconds ?? 0,
      // A day with no footage is trivially "not still recording", but only
      // today can ever be incomplete.
      isComplete: summary ? summary.isComplete : key < isoDate(new Date()),
      isStreamable: summary?.isStreamable ?? false,
      totalBytes: summary?.totalBytes ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }

  return days;
}

/**
 * Everything the Archives page needs for one (season, room, date) selection.
 *
 * Signed URLs are minted only for the requested day — never for the whole
 * season — so a listing request can't hand out a bulk set of playable links.
 */
export async function getArchiveBrowseData(params: {
  season?: string;
  room?: string;
  date?: string;
}): Promise<ArchiveBrowseData> {
  const [seasons, rooms] = await Promise.all([getArchiveSeasons(), getArchiveRooms()]);

  const season =
    seasons.find((s) => s.slug === params.season) ?? seasons[seasons.length - 1] ?? undefined;
  const roomSlug = rooms.find((r) => r.slug === params.room)?.slug ?? rooms[0]?.slug ?? "";

  const days = roomSlug ? await getArchiveDays(season, roomSlug) : [];

  let segments: SignedSegment[] = [];
  if (params.date && roomSlug) {
    const raw = await getRoomArchiveDay(roomSlug, params.date);
    segments = await signArchiveSegments(raw);
  }

  return { seasons, rooms, days, segments };
}
