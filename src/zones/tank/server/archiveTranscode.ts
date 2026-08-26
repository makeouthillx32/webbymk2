// The archive lifecycle: record for everyone, keep for the few.
//
//   recorded           h264, plays on every device
//   < BROWSABLE_DAYS   h264, the public window
//   >= BROWSABLE_DAYS  av1, ~40% the size at equal quality
//
// Measured on this host against a live 4K camera, both targeting 1500k CBR:
// h264_nvenc produced 1.52 Mbps at SSIM 0.962, av1_nvenc 0.60 Mbps at 0.958 —
// indistinguishable quality for 40% of the bytes. That is what makes multi-day
// retention fit on one disk.
//
// The trade is device support: Safari decodes AV1 only on hardware that has it
// (A17 Pro / M3 and later), so an older iPhone cannot play an AV1 segment at
// all. That is acceptable for footage past the public window — it is being
// kept, not browsed — but never for the window itself, which is why the
// conversion is time-gated rather than applied on ingest.
//
// Server-only utilities, no "use server" directive — see archiveDrain.ts.
import { createAdminClient } from "@/utils/supabase/admin";

export type TranscodeCandidate = {
  id: string;
  storagePath: string;
  cameraId: string;
  fileSizeBytes: number;
};

/** Days a segment stays in the browsable, plays-everywhere window. */
export function browsableDays(): number {
  const n = Number(process.env.TANK_ARCHIVE_BROWSABLE_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/** The date on or before which segments should already be AV1. */
export function conversionCutoffDate(now = new Date()): string {
  const d = new Date(now.getTime() - browsableDays() * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/**
 * Segments past the window that are still h264.
 *
 * Bounded by `limit` on purpose: the converter works through a backlog a batch
 * at a time so a first run over weeks of footage cannot saturate the encoder
 * and starve the live rungs, which share the same GPU.
 */
export async function findSegmentsToConvert(limit = 5): Promise<TranscodeCandidate[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tank_archive_segments")
    .select("id, storage_path, camera_id, file_size_bytes")
    .eq("codec", "h264")
    .lt("recorded_date", conversionCutoffDate())
    .not("storage_path", "is", null)
    .neq("tier", "expired")
    // Oldest first: the footage least likely to be watched is converted first,
    // so a partial run still frees the most space.
    .order("recorded_date", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    storagePath: r.storage_path,
    cameraId: r.camera_id,
    fileSizeBytes: Number(r.file_size_bytes) || 0,
  }));
}

/**
 * Records a completed conversion.
 *
 * Only ever called after the converter has verified the new file exists and is
 * non-empty. Marking a segment av1 that is not actually av1 would hand an
 * unplayable file to every viewer whose device lacks AV1 — with no warning,
 * because the warning is driven by this very column.
 */
export async function markSegmentConverted(
  id: string,
  newSizeBytes: number,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("tank_archive_segments")
    .update({
      codec: "av1",
      file_size_bytes: newSizeBytes,
      converted_at: new Date().toISOString(),
    })
    .eq("id", id);

  return error ? { ok: false, error: error.message } : { ok: true };
}
