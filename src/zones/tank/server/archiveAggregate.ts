import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/utils/supabase/admin";

const execFileAsync = promisify(execFile);
const ARCHIVE_ROOT = process.env.TANK_ARCHIVE_LOCAL_ROOT || "/archive";

export type DailyAggregationResult = {
  roomSlug: string;
  recordedDate: string;
  success: boolean;
  masterPath?: string;
  durationSeconds?: number;
  fileSizeBytes?: number;
  error?: string;
};

/**
 * Aggregates all fragmented segments of a completed broadcast day into a single
 * continuous 24-hour master file (s01_{room}_{date}.mp4) and registers it in tank_archives.
 */
export async function aggregateCompletedDay(
  roomSlug: string,
  recordedDate: string,
  seasonSlug = "s01",
): Promise<DailyAggregationResult> {
  const admin = createAdminClient();

  // 1. Confirm whether this day is already aggregated in tank_archives
  const { data: existing } = await admin
    .from("tank_archives")
    .select("id, storage_path")
    .eq("room_slug", roomSlug)
    .eq("recorded_date", recordedDate)
    .maybeSingle();

  if (existing?.storage_path) {
    return {
      roomSlug,
      recordedDate,
      success: true,
      masterPath: existing.storage_path,
    };
  }

  // 2. Fetch the camera ID for this room from tank_camera_registry
  const { data: cam } = await admin
    .from("tank_camera_registry")
    .select("camera_id, name")
    .eq("room_scope", roomSlug)
    .maybeSingle();

  const cameraId = cam?.camera_id || roomSlug;
  const roomName = cam?.name || roomSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // 3. Scan the segments directory for this room and date
  const daySegmentsDir = join(ARCHIVE_ROOT, "segments", cameraId, recordedDate);
  let segmentFiles: string[] = [];
  try {
    const entries = await readdir(daySegmentsDir);
    segmentFiles = entries
      .filter((f) => f.endsWith(".mp4"))
      .sort()
      .map((f) => join(daySegmentsDir, f));
  } catch (err: any) {
    return {
      roomSlug,
      recordedDate,
      success: false,
      error: `Segments directory not found: ${err.message}`,
    };
  }

  if (segmentFiles.length === 0) {
    return {
      roomSlug,
      recordedDate,
      success: false,
      error: "No segment files found to aggregate.",
    };
  }

  // 4. Create concat list for ffmpeg
  const dailyDir = join(ARCHIVE_ROOT, "daily");
  await mkdir(dailyDir, { recursive: true });

  const concatListFile = join(dailyDir, `concat_${cameraId}_${recordedDate}.txt`);
  const masterFileName = `${seasonSlug}_${roomSlug}_${recordedDate}.mp4`;
  const masterFilePath = join(dailyDir, masterFileName);
  const relativeStoragePath = `daily/${masterFileName}`;

  const concatContent = segmentFiles.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await writeFile(concatListFile, concatContent, "utf8");

  // 5. Concatenate segments without re-encoding (stream copy)
  try {
    await execFileAsync("ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListFile,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "-y",
      masterFilePath,
    ]);
  } catch (err: any) {
    return {
      roomSlug,
      recordedDate,
      success: false,
      error: `ffmpeg concatenation failed: ${err.message}`,
    };
  }

  // 6. Measure output size and duration
  let masterSize = 0;
  let duration = 0;
  try {
    masterSize = (await stat(masterFilePath)).size;
    const probe = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      masterFilePath,
    ]);
    duration = Math.round(parseFloat(probe.stdout.trim()) || 0);
  } catch {}

  // 7. Insert or update the monolithic day row in tank_archives
  const { error: dbError } = await admin.from("tank_archives").upsert(
    {
      season_slug: seasonSlug,
      room_slug: roomSlug,
      recorded_date: recordedDate,
      title: `${roomName} — 24h Archive`,
      duration_seconds: duration,
      file_name: masterFileName,
      storage_bucket: "tank-archives",
      storage_path: relativeStoragePath,
      file_size_bytes: masterSize,
      video_url: null,
      metadata: {
        aggregatedAt: new Date().toISOString(),
        segmentCount: segmentFiles.length,
      },
    },
    { onConflict: "season_slug,room_slug,recorded_date" },
  );

  if (dbError) {
    return {
      roomSlug,
      recordedDate,
      success: false,
      error: `Failed to register 24h archive in database: ${dbError.message}`,
    };
  }

  return {
    roomSlug,
    recordedDate,
    success: true,
    masterPath: relativeStoragePath,
    durationSeconds: duration,
    fileSizeBytes: masterSize,
  };
}

/**
 * Scans all completed dates in tank_archive_days that have not yet been consolidated
 * into a single 24-hour master file in tank_archives.
 */
export async function aggregateAllPendingDays(): Promise<DailyAggregationResult[]> {
  const admin = createAdminClient();
  const { data: days, error } = await admin
    .from("tank_archive_days")
    .select("room_slug, recorded_date, season_slug, is_complete")
    .eq("is_complete", true);

  if (error || !days) return [];

  const results: DailyAggregationResult[] = [];
  for (const row of days) {
    const res = await aggregateCompletedDay(row.room_slug, row.recorded_date, row.season_slug || "s01");
    results.push(res);
  }
  return results;
}

export type PendingAggregationDay = {
  roomSlug: string;
  recordedDate: string;
  seasonSlug: string;
  cameraId: string;
};

/**
 * Returns any completed past days (recorded_date < today) that have segments recorded
 * but have not yet been consolidated into a monolithic 24-hour master file in tank_archives.
 */
export async function getPendingAggregationDays(): Promise<PendingAggregationDay[]> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Find distinct past days with segments
  const { data: segments, error } = await admin
    .from("tank_archive_segments")
    .select("room_slug, recorded_date, season_slug, camera_id")
    .lt("recorded_date", today)
    .neq("room_slug", "all-rooms")
    .order("recorded_date", { ascending: false });

  if (error || !segments) return [];

  // Group uniquely by room_slug + recorded_date
  const uniqueMap = new Map<string, PendingAggregationDay>();
  for (const s of segments) {
    const key = `${s.room_slug}_${s.recorded_date}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        roomSlug: s.room_slug,
        recordedDate: s.recorded_date,
        seasonSlug: s.season_slug || "s01",
        cameraId: s.camera_id,
      });
    }
  }

  // Filter out any that already exist in tank_archives
  const { data: existingMasters } = await admin
    .from("tank_archives")
    .select("room_slug, recorded_date");

  const existingSet = new Set(
    (existingMasters ?? []).map((m: any) => `${m.room_slug}_${m.recorded_date}`),
  );

  const pending: PendingAggregationDay[] = [];
  for (const [key, item] of uniqueMap.entries()) {
    if (!existingSet.has(key)) {
      pending.push(item);
    }
  }

  return pending;
}

/**
 * Records a newly concatenated 24-hour master file into tank_archives.
 */
export async function recordDailyArchiveMaster(params: {
  roomSlug: string;
  recordedDate: string;
  seasonSlug?: string;
  storagePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  segmentCount?: number;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const admin = createAdminClient();
  const seasonSlug = params.seasonSlug || "s01";
  const roomTitle = params.roomSlug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const fileName = params.storagePath.split("/").pop() || `${seasonSlug}_${params.roomSlug}_${params.recordedDate}.mp4`;

  const { data, error } = await admin
    .from("tank_archives")
    .upsert(
      {
        season_slug: seasonSlug,
        room_slug: params.roomSlug,
        recorded_date: params.recordedDate,
        title: `${roomTitle} — 24h Archive`,
        duration_seconds: params.durationSeconds,
        file_name: fileName,
        storage_bucket: "tank-archives",
        storage_path: params.storagePath,
        file_size_bytes: params.fileSizeBytes,
        video_url: null,
        metadata: {
          aggregatedAt: new Date().toISOString(),
          segmentCount: params.segmentCount || 0,
        },
      },
      { onConflict: "season_slug,room_slug,recorded_date" },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, id: data?.id };
}

let g_aggregationTimer: NodeJS.Timeout | null = null;

/**
 * Starts the background consolidation loop inside the Tank runtime.
 * Periodically checks for completed broadcast days and aggregates segments into 24-hour master files.
 */
export function startArchiveAggregationScheduler(): void {
  if (g_aggregationTimer) return;

  const intervalSeconds = parseInt(
    process.env.TANK_ARCHIVE_AGGREGATE_INTERVAL_SECONDS || "3600",
    10,
  );
  const intervalMs = Math.max(300, intervalSeconds) * 1000;

  console.log(`[ArchiveScheduler] Background scheduler initialized (cadence: ${Math.round(intervalMs / 1000)}s)`);

  // Initial pass 60 seconds after server startup
  setTimeout(async () => {
    try {
      const results = await aggregateAllPendingDays();
      if (results.length > 0) {
        console.log(`[ArchiveScheduler] Initial pass completed: aggregated ${results.filter((r) => r.success).length} days`);
      }
    } catch (err) {
      console.error("[ArchiveScheduler] Initial aggregation pass error:", err);
    }
  }, 60_000);

  // Recurring background interval
  g_aggregationTimer = setInterval(async () => {
    try {
      const results = await aggregateAllPendingDays();
      if (results.length > 0) {
        console.log(`[ArchiveScheduler] Periodic pass completed: aggregated ${results.filter((r) => r.success).length} days`);
      }
    } catch (err) {
      console.error("[ArchiveScheduler] Periodic aggregation pass error:", err);
    }
  }, intervalMs);
}

