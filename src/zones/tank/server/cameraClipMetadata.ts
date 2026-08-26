import type { DiscoveredCamera } from "../contracts";
import { getLoopObjectUrl } from "../mediaPlayback";
import { createAdminClient } from "@/utils/supabase/admin";

export type ClipRow = {
  camera_id: unknown;
  storage_path: unknown;
  captured_at: unknown;
  source_stable_at: unknown;
  duration_seconds: unknown;
  generation: unknown;
};

function maxClipAgeSeconds(): number {
  const configured = Number(process.env.TANK_CLIP_MAX_AGE_SECONDS ?? 1800);
  if (!Number.isFinite(configured)) return 1800;
  return Math.min(86_400, Math.max(300, Math.round(configured)));
}

export function projectRecentClip(row: ClipRow, cameraId: string, now: number) {
  if (row.camera_id !== cameraId || typeof row.storage_path !== "string") return null;
  if (!row.storage_path.startsWith(`cameras/${cameraId}/`)) return null;

  const url = getLoopObjectUrl(row.storage_path);
  const capturedAt = typeof row.captured_at === "string" ? row.captured_at : null;
  const capturedMs = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (!url || !Number.isFinite(capturedMs) || capturedMs > now + 60_000) return null;

  const maxAgeMs = maxClipAgeSeconds() * 1000;
  const fresh = now - capturedMs <= maxAgeMs;
  return {
    recentClipUrl: fresh ? url : null,
    recentClipCapturedAt: capturedAt,
    recentClipExpiresAt: new Date(capturedMs + maxAgeMs).toISOString(),
    recentClipStatus: fresh ? "ready" as const : "stale" as const,
    recentClipDurationSeconds:
      typeof row.duration_seconds === "number" ? row.duration_seconds : null,
    recentClipGeneration:
      typeof row.generation === "number" ? row.generation : null,
    recentClipSourceStableAt:
      typeof row.source_stable_at === "string" ? row.source_stable_at : null,
  };
}

/** Adds only viewer-safe freshness data to the public camera projection. */
export async function attachRecentCameraClips(
  cameras: DiscoveredCamera[],
  now = Date.now(),
): Promise<DiscoveredCamera[]> {
  if (cameras.length === 0) return cameras;

  try {
    const ids = [...new Set(cameras.map((camera) => camera.id))];
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tank_camera_clips")
      .select("camera_id,storage_path,captured_at,source_stable_at,duration_seconds,generation")
      .in("camera_id", ids);
    if (error) throw error;

    const rows = new Map(
      ((data ?? []) as ClipRow[])
        .filter((row): row is ClipRow & { camera_id: string } => typeof row.camera_id === "string")
        .map((row) => [row.camera_id, row]),
    );

    return cameras.map((camera) => {
      const row = rows.get(camera.id);
      const safe = row ? projectRecentClip(row, camera.id, now) : null;
      return {
        ...camera,
        recentClipUrl: safe?.recentClipUrl ?? null,
        recentClipCapturedAt: safe?.recentClipCapturedAt ?? null,
        recentClipExpiresAt: safe?.recentClipExpiresAt ?? null,
        recentClipStatus: safe?.recentClipStatus ?? "missing",
        recentClipDurationSeconds: safe?.recentClipDurationSeconds ?? null,
        recentClipGeneration: safe?.recentClipGeneration ?? null,
        recentClipSourceStableAt: safe?.recentClipSourceStableAt ?? null,
      };
    });
  } catch (error) {
    console.warn(
      "[cameraClipMetadata] freshness lookup failed; clips withheld:",
      error instanceof Error ? error.message : error,
    );
    return cameras.map((camera) => ({
      ...camera,
      recentClipUrl: null,
      recentClipCapturedAt: null,
      recentClipExpiresAt: null,
      recentClipStatus: "missing",
      recentClipDurationSeconds: null,
      recentClipGeneration: null,
      recentClipSourceStableAt: null,
    }));
  }
}
