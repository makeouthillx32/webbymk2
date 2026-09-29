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

export type DayRoomFootage = {
  slug: string;
  name: string;
  kind: "fixed-247" | "irl" | "user-stream";
  kindLabel: string;
  segmentCount: number;
  totalSeconds: number;
  formattedDuration: string;
  activeWindow: string;
  is24Hour: boolean;
  hasMasterArchive: boolean;
  isRecordingLive?: boolean;
};

export type ArchiveBrowseData = {
  seasons: ArchiveSeasonOption[];
  rooms: ArchiveRoomOption[];
  days: ArchiveDay[];
  selectedDate: string | null;
  roomsOnDay: DayRoomFootage[];
  selectedRoom: string | null;
  segments: SignedSegment[];
};

function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0m";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h >= 1) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${Math.max(1, m)}m`;
}

/**
 * Every calendar day in the season, each flagged with whether footage exists.
 * If roomSlug is omitted, checks whether ANY room recorded footage on that date.
 */
export async function getArchiveDays(
  season: ArchiveSeasonOption | undefined,
  roomSlug?: string,
): Promise<ArchiveDay[]> {
  if (!season) return [];

  const start = new Date(season.startsAt);
  if (Number.isNaN(start.getTime())) return [];

  // An open-ended (current) season runs to today, not forever.
  const rawEnd = season.endsAt ? new Date(season.endsAt) : new Date();
  const end = Number.isNaN(rawEnd.getTime()) ? new Date() : rawEnd;

  const summaries = new Map<string, {
    segmentCount: number;
    totalSeconds: number;
    isComplete: boolean;
    isStreamable: boolean;
    totalBytes: number;
  }>();

  try {
    const supabase = await createClient();
    let query = supabase
      .from("tank_archive_days")
      .select("recorded_date, segment_count, total_seconds, is_complete, is_streamable, total_bytes, room_slug")
      .limit(2000);

    if (roomSlug) {
      query = query.eq("room_slug", roomSlug);
    }

    const { data } = await query;

    for (const row of data ?? []) {
      const d = (row as any).recorded_date as string;
      if (!d) continue;
      const prev = summaries.get(d);
      if (!prev) {
        summaries.set(d, {
          segmentCount: Number((row as any).segment_count) || 0,
          totalSeconds: Number((row as any).total_seconds) || 0,
          isComplete: Boolean((row as any).is_complete),
          isStreamable: Boolean((row as any).is_streamable),
          totalBytes: Number((row as any).total_bytes) || 0,
        });
      } else {
        prev.segmentCount += Number((row as any).segment_count) || 0;
        prev.totalSeconds += Number((row as any).total_seconds) || 0;
        prev.totalBytes += Number((row as any).total_bytes) || 0;
        if (Boolean((row as any).is_streamable)) prev.isStreamable = true;
      }
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
 * Returns all rooms that recorded footage on a given date, with categorization:
 * - fixed-247: 24/7 IP cameras (showing 24h continuous footage or live REC)
 * - irl: mobile/IRL cameras (showing active duration and time window)
 * - user-stream: user streams & OBS guest rooms (showing broadcast session length)
 */
export async function getRoomsOnDay(date: string): Promise<DayRoomFootage[]> {
  const supabase = await createClient();
  const today = isoDate(new Date());
  const isToday = date === today;

  const FIXED_HOUSE_SLUGS = new Set([
    "living-room",
    "kitchen",
    "foyer",
    "game-room",
    "game-room-2",
    "makeup-room",
    "courtyard",
    "patio",
    "basement",
  ]);

  // 1. Query tank_archive_days for this date
  const { data: dayRows } = await supabase
    .from("tank_archive_days")
    .select("room_slug, segment_count, total_seconds, first_segment_at, last_segment_at, is_complete")
    .eq("recorded_date", date);

  // 2. Query tank_archives for any consolidated masters for this date
  const { data: masterRows } = await supabase
    .from("tank_archives")
    .select("room_slug, duration_seconds, storage_path")
    .eq("recorded_date", date);

  const masterMap = new Map<string, any>();
  for (const m of masterRows ?? []) {
    if (m.room_slug) masterMap.set(m.room_slug, m);
  }

  // 3. Query camera registry and room titles to resolve room details & tags
  const [roomsRes, camsRes] = await Promise.all([
    supabase.from("tank_rooms").select("slug, title, tags"),
    supabase.from("tank_camera_registry").select("room_scope, name, tags"),
  ]);

  const roomTitleMap = new Map<string, string>();
  const roomTagsMap = new Map<string, string[]>();

  for (const r of roomsRes.data ?? []) {
    if (r.slug) {
      roomTitleMap.set(r.slug, r.title || r.slug);
      roomTagsMap.set(r.slug, r.tags || []);
    }
  }

  for (const c of camsRes.data ?? []) {
    if (c.room_scope && c.room_scope !== "unscoped") {
      if (!roomTitleMap.has(c.room_scope)) {
        roomTitleMap.set(c.room_scope, c.name);
      }
      const existingTags = roomTagsMap.get(c.room_scope) || [];
      roomTagsMap.set(c.room_scope, [...existingTags, ...(c.tags || [])]);
    }
  }

  const results: DayRoomFootage[] = [];
  const seenRooms = new Set<string>();

  for (const row of dayRows ?? []) {
    const slug = row.room_slug;
    if (!slug || NON_CAMERA_ROOMS.has(slug) || seenRooms.has(slug)) continue;
    seenRooms.add(slug);

    const tags = roomTagsMap.get(slug) || [];
    const name = roomTitleMap.get(slug) || slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const hasMaster = masterMap.has(slug);

    const isFixed = FIXED_HOUSE_SLUGS.has(slug) || tags.includes("fixed");
    const isIrl = slug.includes("irl") || tags.includes("irl") || tags.includes("mobile") || tags.includes("roaming");
    const isUserStream = tags.includes("obs") || slug.startsWith("user-") || slug.startsWith("obs-");

    let kind: "fixed-247" | "irl" | "user-stream" = "fixed-247";
    let kindLabel = "24/7 IP CAMERA";

    if (isIrl) {
      kind = "irl";
      kindLabel = "IRL / MOBILE CAM";
    } else if (isUserStream) {
      kind = "user-stream";
      kindLabel = "LIVE STREAM ROOM";
    } else if (isFixed) {
      kind = "fixed-247";
      kindLabel = "24/7 IP CAMERA";
    } else {
      kind = "user-stream";
      kindLabel = "EVENT ROOM";
    }

    const totalSeconds = Number(row.total_seconds) || (hasMaster ? 86400 : 0);
    const segmentCount = Number(row.segment_count) || 0;

    let formattedDuration = "";
    let activeWindow = "";
    const is24Hour = kind === "fixed-247";

    if (is24Hour) {
      if (isToday) {
        formattedDuration = `REC Live (${formatDuration(totalSeconds)})`;
        activeWindow = "All Day (24/7 Ongoing)";
      } else {
        formattedDuration = "24h Continuous Footage";
        activeWindow = "All Day (24/7)";
      }
    } else {
      formattedDuration = `Active: ${formatDuration(totalSeconds)}`;
      if (row.first_segment_at && row.last_segment_at) {
        const startStr = new Date(row.first_segment_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        const endStr = new Date(row.last_segment_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        activeWindow = `${startStr} – ${endStr}`;
      } else {
        activeWindow = `${segmentCount} recordings`;
      }
    }

    results.push({
      slug,
      name,
      kind,
      kindLabel,
      segmentCount,
      totalSeconds,
      formattedDuration,
      activeWindow,
      is24Hour,
      hasMasterArchive: hasMaster,
      isRecordingLive: isToday,
    });
  }

  // Also include any rooms that exist in tank_archives for this day but might not have raw segments in tank_archive_days
  for (const [mSlug, mRow] of masterMap.entries()) {
    if (!seenRooms.has(mSlug) && !NON_CAMERA_ROOMS.has(mSlug)) {
      seenRooms.add(mSlug);
      const name = roomTitleMap.get(mSlug) || mSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      results.push({
        slug: mSlug,
        name,
        kind: "fixed-247",
        kindLabel: "24/7 IP CAMERA",
        segmentCount: 1,
        totalSeconds: mRow.duration_seconds || 86400,
        formattedDuration: "24h Continuous Footage",
        activeWindow: "All Day (24/7)",
        is24Hour: true,
        hasMasterArchive: true,
        isRecordingLive: false,
      });
    }
  }

  // Sort: fixed-247 first (sorted by name), then IRL, then user-stream
  return results.sort((a, b) => {
    if (a.kind === "fixed-247" && b.kind !== "fixed-247") return -1;
    if (a.kind !== "fixed-247" && b.kind === "fixed-247") return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Everything the Archives page needs for one (season, date, room) selection.
 * Follows the Days -> Rooms on Day -> Footage hierarchy.
 */
export async function getArchiveBrowseData(params: {
  season?: string;
  room?: string;
  date?: string;
}): Promise<ArchiveBrowseData> {
  const [seasons, rooms] = await Promise.all([getArchiveSeasons(), getArchiveRooms()]);

  const season =
    seasons.find((s) => s.slug === params.season) ?? seasons[seasons.length - 1] ?? undefined;

  // 1. Days across the entire broadcast
  const days = await getArchiveDays(season);

  // 2. Resolve selectedDate: explicit param, or newest day with footage, or today
  const latestDayWithFootage = days.filter((d) => d.hasFootage).pop()?.date;
  const selectedDate = params.date || latestDayWithFootage || isoDate(new Date());

  // 3. Resolve rooms active on this selected day
  const roomsOnDay = selectedDate ? await getRoomsOnDay(selectedDate) : [];

  // 4. Resolve selectedRoom: explicit param if valid on that day, or first room on that day, or fallback
  const validRoomOnDay = roomsOnDay.find((r) => r.slug === params.room);
  const selectedRoom = validRoomOnDay?.slug ?? roomsOnDay[0]?.slug ?? params.room ?? rooms[0]?.slug ?? "";

  // 5. Mint signed segment links for the selected room and date
  let segments: SignedSegment[] = [];
  if (selectedDate && selectedRoom) {
    const raw = await getRoomArchiveDay(selectedRoom, selectedDate);
    segments = await signArchiveSegments(raw);
  }

  return {
    seasons,
    rooms,
    days,
    selectedDate,
    roomsOnDay,
    selectedRoom,
    segments,
  };
}

