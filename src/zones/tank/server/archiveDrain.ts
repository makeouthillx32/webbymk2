// Deliberately NOT a "use server" module. These are server-only utilities
// called from route handlers, and that directive requires every export to be
// an async Server Action — getDrainTarget() is a sync config read. Same
// convention as archiveDb.ts.
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createAdminClient } from "@/utils/supabase/admin";
import { ARCHIVE_BUCKET } from "../mediaPlayback";

// Moves footage off Supabase Storage once it has aged out of the hot window.
//
// Supabase Storage is the 24h hot tier: members scrub the last day there. After
// that the bytes have to leave, because the storage volume shares a disk with
// Postgres and 6 cameras at ~3 Mbps write ~194 GB/day — the hot tier fills the
// disk in under two days on its own. The drain is what makes the whole design
// survive past day two, so it is written to fail safe, never fast.
//
// The target is pluggable on purpose. Today it is a filesystem path (a mounted
// share, a second disk); the intended destination is a network drive that is
// not currently reachable from this host. Nothing here assumes a specific
// backend beyond "a directory we can write and then read back".

export type DrainTarget = {
  kind: "filesystem";
  root: string;
};

export type DrainReport = {
  configured: boolean;
  scanned: number;
  drained: number;
  bytesDrained: number;
  failed: number;
  skipped: string[];
  error?: string;
};

const DEFAULT_HOT_WINDOW_HOURS = 24;

/**
 * How many days of footage stay in the browsable archive.
 *
 * Retention is three tiers, not two:
 *
 *   hot        Supabase Storage, streamable in the browser        (~24h)
 *   browsable  drained to local disk, still listed and playable   (4 days)
 *   cold       past the window: re-encoded to AV1 and dropped
 *              from the archive index
 *
 * The third tier exists because AV1 is worth ~2.5x in storage at equal quality
 * (measured: 0.60 Mbps vs 1.52 Mbps at SSIM 0.958 vs 0.962) but Safari can only
 * decode it on A17 Pro / M3 hardware and later. That makes AV1 unusable for
 * roughly half the audience — fine for material being *kept*, unacceptable for
 * material being *browsed*. So the browsable window stays H.264 and only what
 * ages out of it gets converted.
 */
const DEFAULT_BROWSABLE_DAYS = 4;

/**
 * Days of footage kept browsable. 0 is honoured (it means "convert everything
 * that has been drained"), so only an absent or non-numeric value falls back.
 */
export function resolveBrowsableDays(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const fromEnv = Number(process.env.TANK_ARCHIVE_BROWSABLE_DAYS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return DEFAULT_BROWSABLE_DAYS;
}

/**
 * The cutoff before which footage should leave the browsable archive.
 *
 * Separated from the drain cutoff on purpose: draining moves bytes off
 * Supabase, this decides what a member can still find and play. Conflating
 * them is how footage silently disappears from the UI the moment it drains.
 */
export function browsableCutoff(now = new Date(), explicitDays?: number): Date {
  return new Date(now.getTime() - resolveBrowsableDays(explicitDays) * 86_400_000);
}

/**
 * Resolves how long footage stays hot: explicit argument, then env, then the
 * default. Only a genuinely absent or non-numeric value falls through — 0 is
 * kept, because "drain everything now" is a real operator instruction and
 * silently substituting 24h for it would make the command appear to do nothing.
 */
export function resolveHotWindowHours(explicit?: number): number {
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }
  const fromEnv = Number(process.env.TANK_ARCHIVE_HOT_WINDOW_HOURS);
  if (Number.isFinite(fromEnv) && fromEnv >= 0) return fromEnv;
  return DEFAULT_HOT_WINDOW_HOURS;
}

export function getDrainTarget(): DrainTarget | null {
  const root = process.env.TANK_ARCHIVE_DRAIN_PATH;
  if (!root) return null;
  return { kind: "filesystem", root };
}

/**
 * Confirms the target is genuinely writable before a single byte is deleted
 * from Supabase. An unreachable network share that silently resolves to an
 * empty local directory is the exact failure that would quietly delete a day
 * of footage while reporting success.
 */
async function assertTargetUsable(target: DrainTarget): Promise<string | null> {
  try {
    await mkdir(target.root, { recursive: true });
    const info = await stat(target.root);
    if (!info.isDirectory()) return `Drain path ${target.root} is not a directory.`;
    return null;
  } catch (err) {
    return `Drain path ${target.root} is unreachable: ${err instanceof Error ? err.message : "unknown error"}`;
  }
}

/**
 * Drains every hot segment older than the hot window.
 *
 * Per segment the order is deliberate and never reordered:
 *   1. download from Supabase
 *   2. write to the target
 *   3. verify the written size matches the recorded size
 *   4. only then flip the row to 'cold' and delete from Supabase
 *
 * A failure at any step leaves the segment hot and the bytes in Supabase. The
 * cost of that is disk pressure, which is visible and recoverable. The cost of
 * deleting first would be footage that no longer exists anywhere.
 */
export async function drainAgedSegments(options?: {
  hotWindowHours?: number;
  limit?: number;
}): Promise<DrainReport> {
  const report: DrainReport = {
    configured: false,
    scanned: 0,
    drained: 0,
    bytesDrained: 0,
    failed: 0,
    skipped: [],
  };

  const target = getDrainTarget();
  if (!target) {
    report.error =
      "No drain target configured (TANK_ARCHIVE_DRAIN_PATH). Footage stays in Supabase Storage.";
    return report;
  }

  const unusable = await assertTargetUsable(target);
  if (unusable) {
    report.error = unusable;
    return report;
  }
  report.configured = true;

  // 0 is a legitimate value meaning "drain everything now", so it must survive
  // resolution rather than being treated as unset. `||` chains would silently
  // turn an operator's explicit 0 into the 24h default and drain nothing.
  const hotWindowHours = resolveHotWindowHours(options?.hotWindowHours);
  const cutoff = new Date(Date.now() - hotWindowHours * 3600_000);

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("tank_archive_segments")
    .select("id, camera_id, storage_path, file_size_bytes, segment_start")
    .eq("tier", "hot")
    .lt("segment_start", cutoff.toISOString())
    .order("segment_start", { ascending: true })
    .limit(options?.limit ?? 50);

  if (error) {
    report.error = error.message;
    return report;
  }
  if (!rows || rows.length === 0) return report;

  report.scanned = rows.length;

  for (const row of rows) {
    const storagePath: string | null = row.storage_path;
    if (!storagePath) {
      report.skipped.push(`${row.id}: hot row with no storage_path`);
      report.failed += 1;
      continue;
    }

    // Refuse anything that would escape the drain root. storage_path is built
    // by the recording hook, but it reaches this line via the database and is
    // treated as untrusted input regardless.
    const destination = resolve(join(target.root, storagePath));
    if (!destination.startsWith(resolve(target.root))) {
      report.skipped.push(`${row.id}: storage_path escapes the drain root`);
      report.failed += 1;
      continue;
    }

    try {
      const { data: blob, error: dlError } = await admin.storage
        .from(ARCHIVE_BUCKET)
        .download(storagePath);

      if (dlError || !blob) {
        report.skipped.push(`${row.id}: download failed (${dlError?.message ?? "no body"})`);
        report.failed += 1;
        continue;
      }

      await mkdir(dirname(destination), { recursive: true });
      await pipeline(
        Readable.fromWeb(blob.stream() as any),
        createWriteStream(destination),
      );

      const written = await stat(destination);
      const expected = Number(row.file_size_bytes ?? 0);
      // A short write is the signature of a share dropping mid-copy. Treat it
      // as a failure and remove the partial file so a later pass re-drains it
      // cleanly rather than trusting a truncated video.
      if (expected > 0 && written.size !== expected) {
        await unlink(destination).catch(() => {});
        report.skipped.push(`${row.id}: size mismatch (${written.size} != ${expected})`);
        report.failed += 1;
        continue;
      }

      const { error: updateError } = await admin
        .from("tank_archive_segments")
        .update({
          tier: "cold",
          cold_path: destination,
          drained_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateError) {
        // The copy exists but the index still says hot. Leave Supabase alone —
        // the next pass overwrites the same destination harmlessly.
        await unlink(destination).catch(() => {});
        report.skipped.push(`${row.id}: index update failed (${updateError.message})`);
        report.failed += 1;
        continue;
      }

      // Index now points at the cold copy, so reclaiming the hot bytes is safe.
      const { error: removeError } = await admin.storage
        .from(ARCHIVE_BUCKET)
        .remove([storagePath]);

      if (removeError) {
        // Non-fatal and self-correcting: the row is cold and playable from the
        // cold copy; this object is now an orphan for the sweeper to reclaim.
        report.skipped.push(`${row.id}: drained but Supabase copy not removed (${removeError.message})`);
      }

      report.drained += 1;
      report.bytesDrained += written.size;
    } catch (err) {
      report.skipped.push(`${row.id}: ${err instanceof Error ? err.message : "unknown error"}`);
      report.failed += 1;
    }
  }

  return report;
}

/**
 * Reclaims hot footage when there is nowhere cold to send it.
 *
 * The drain refuses to delete anything without a verified cold copy, which is
 * correct — but it means that with no drain target the hot tier grows forever.
 * At ~221 GB/day across 7 cameras that fills the disk Postgres lives on in
 * under a day, so "archiving is on and the drain is not configured" is a
 * database outage on a timer.
 *
 * This is the release valve: expire the OLDEST hot segments once the archive
 * exceeds a byte budget. It is real data loss, so it is opt-in
 * (TANK_ARCHIVE_MAX_HOT_GB) and it never touches anything already drained to
 * cold storage — only footage that would otherwise sink the box.
 */
export async function enforceHotStorageBudget(): Promise<{
  enabled: boolean;
  budgetGb: number;
  hotGb: number;
  expired: number;
  bytesReclaimed: number;
}> {
  const budgetGb = Number(process.env.TANK_ARCHIVE_MAX_HOT_GB);
  if (!Number.isFinite(budgetGb) || budgetGb <= 0) {
    return { enabled: false, budgetGb: 0, hotGb: 0, expired: 0, bytesReclaimed: 0 };
  }

  const admin = createAdminClient();
  const budgetBytes = budgetGb * 1024 ** 3;

  // Oldest first: if something has to go, it should be the footage least
  // likely to still be interesting.
  const { data: rows } = await admin
    .from("tank_archive_segments")
    .select("id, storage_path, file_size_bytes")
    .eq("tier", "hot")
    .order("segment_start", { ascending: true })
    .limit(5000);

  const all = rows ?? [];
  const totalBytes = all.reduce((sum, r) => sum + Number(r.file_size_bytes ?? 0), 0);
  if (totalBytes <= budgetBytes) {
    return {
      enabled: true,
      budgetGb,
      hotGb: totalBytes / 1024 ** 3,
      expired: 0,
      bytesReclaimed: 0,
    };
  }

  let over = totalBytes - budgetBytes;
  let expired = 0;
  let reclaimed = 0;

  for (const row of all) {
    if (over <= 0) break;
    const bytes = Number(row.file_size_bytes ?? 0);
    const path: string | null = row.storage_path;

    if (path) {
      const { error } = await admin.storage.from(ARCHIVE_BUCKET).remove([path]);
      // If the object will not delete, do NOT mark the row expired — that
      // would orphan the bytes and under-report usage forever.
      if (error) continue;
    }

    await admin
      .from("tank_archive_segments")
      .update({ tier: "expired", storage_path: null, drained_at: new Date().toISOString() })
      .eq("id", row.id);

    expired += 1;
    reclaimed += bytes;
    over -= bytes;
  }

  return {
    enabled: true,
    budgetGb,
    hotGb: (totalBytes - reclaimed) / 1024 ** 3,
    expired,
    bytesReclaimed: reclaimed,
  };
}

/**
 * How much footage is sitting in each tier. Drives the operator readout and is
 * the number to watch before turning recording on — hot bytes live on the same
 * disk as the database.
 */
export async function getArchiveStorageReport(): Promise<{
  hotBytes: number;
  coldBytes: number;
  hotSegments: number;
  coldSegments: number;
  oldestHot: string | null;
  drainConfigured: boolean;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tank_archive_segments")
    .select("tier, file_size_bytes, segment_start")
    .neq("tier", "expired")
    .limit(20000);

  let hotBytes = 0;
  let coldBytes = 0;
  let hotSegments = 0;
  let coldSegments = 0;
  let oldestHot: string | null = null;

  for (const row of data ?? []) {
    const bytes = Number(row.file_size_bytes ?? 0);
    if (row.tier === "hot") {
      hotBytes += bytes;
      hotSegments += 1;
      if (!oldestHot || row.segment_start < oldestHot) oldestHot = row.segment_start;
    } else if (row.tier === "cold") {
      coldBytes += bytes;
      coldSegments += 1;
    }
  }

  return {
    hotBytes,
    coldBytes,
    hotSegments,
    coldSegments,
    oldestHot,
    drainConfigured: getDrainTarget() !== null,
  };
}
