import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";

type SupabaseArchiveRow = {
  id: string;
  season_slug: string;
  room_slug: string;
  recorded_date: string;
  start_time: string;
  end_time: string | null;
  duration_seconds: number;
  title: string;
  episode_number: number | null;
  file_name: string | null;
  storage_bucket: string;
  storage_path: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  description: string | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type ArchiveRecording = {
  id: string;
  seasonSlug: string;
  roomSlug: string;
  recordedDate: string;
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  title: string;
  episodeNumber: number | null;
  fileName: string;
  storagePath: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  description: string | null;
  fileSizeBytes: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ArchiveFilterOptions = {
  seasons: { slug: string; name: string; count: number }[];
  rooms: { slug: string; name: string; count: number }[];
  availableDates: string[];
};

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://192.168.50.204:8000";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, key);
}

function transformArchiveRow(row: SupabaseArchiveRow): ArchiveRecording {
  const fileName = row.file_name || `${row.season_slug}_${row.room_slug}_${row.recorded_date}.mp4`;
  const defaultVideoUrl = row.video_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL || "https://db.unenter.live"}/storage/v1/object/public/tank-archives/${row.storage_path || fileName}`;

  return {
    id: row.id,
    seasonSlug: row.season_slug || "s01",
    roomSlug: row.room_slug || "all-rooms",
    recordedDate: row.recorded_date,
    startTime: row.start_time || "00:00:00",
    endTime: row.end_time,
    durationSeconds: row.duration_seconds || 0,
    title: row.title,
    episodeNumber: row.episode_number,
    fileName,
    storagePath: row.storage_path,
    videoUrl: defaultVideoUrl,
    thumbnailUrl: row.thumbnail_url,
    description: row.description,
    fileSizeBytes: row.file_size_bytes || 0,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

export async function getArchiveFilters(): Promise<ArchiveFilterOptions> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("tank_archives")
    .select("season_slug, room_slug, recorded_date");

  if (error || !data || data.length === 0) {
    return {
      seasons: [{ slug: "s01", name: "Season 1", count: 1 }],
      rooms: [
        { slug: "all-rooms", name: "All Rooms", count: 1 },
        { slug: "game-room", name: "Game Room", count: 1 },
      ],
      availableDates: [new Date().toISOString().split("T")[0]],
    };
  }

  const seasonMap = new Map<string, number>();
  const roomMap = new Map<string, number>();
  const datesSet = new Set<string>();

  for (const row of data as SupabaseArchiveRow[]) {
    const s = row.season_slug || "s01";
    const r = row.room_slug || "all-rooms";
    seasonMap.set(s, (seasonMap.get(s) || 0) + 1);
    roomMap.set(r, (roomMap.get(r) || 0) + 1);
    if (row.recorded_date) datesSet.add(row.recorded_date);
  }

  const seasons = Array.from(seasonMap.entries()).map(([slug, count]) => ({
    slug,
    name: slug.toUpperCase().replace("S", "Season "),
    count,
  }));

  const rooms = [
    { slug: "all-rooms", name: "All Rooms", count: data.length },
    ...Array.from(roomMap.entries())
      .filter(([slug]) => slug !== "all-rooms")
      .map(([slug, count]) => ({
        slug,
        name: slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        count,
      })),
  ];

  const availableDates = Array.from(datesSet).sort().reverse();

  return { seasons, rooms, availableDates };
}

export async function getArchiveRecordings(params: {
  season?: string;
  room?: string;
  day?: string;
  limit?: number;
}): Promise<ArchiveRecording[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from("tank_archives").select("*").order("recorded_date", { ascending: false }).order("start_time", { ascending: true });

  if (params.season && params.season !== "all") {
    query = query.eq("season_slug", params.season);
  }

  if (params.room && params.room !== "all-rooms") {
    query = query.eq("room_slug", params.room);
  }

  if (params.day) {
    query = query.eq("recorded_date", params.day);
  }

  if (params.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return (data as SupabaseArchiveRow[]).map(transformArchiveRow);
}
