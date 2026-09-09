import { execSync, spawn } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAdminClient } from "@/utils/supabase/admin";
import { LOOP_BUCKET } from "../mediaPlayback";

export type RoomLoopRefreshResult = {
  cameraId: string;
  cameraName: string;
  success: boolean;
  fileSizeBytes?: number;
  durationSeconds?: number;
  error?: string;
};

export type SrtManagerCameraConfig = {
  id: string;
  name: string;
  streamUser: string;
  streamKey: string;
  videoOutPort: number;
  enabled: boolean;
  roomScope?: string;
};

/**
 * Fetches the live SRT camera configuration from the SRT receiver manager on localhost:5050.
 */
export async function getLiveCameraConfigs(): Promise<SrtManagerCameraConfig[]> {
  try {
    const res = await fetch("http://127.0.0.1:5050/api/config", { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { cameras?: SrtManagerCameraConfig[] };
    return (json.cameras ?? []).filter((c) => c.enabled && c.videoOutPort && c.streamKey);
  } catch {
    return [];
  }
}

/**
 * Captures a fresh clip directly from a camera's live SRT stream and
 * overwrites its singular loop file in Supabase Storage.
 *
 * Was 120s by default. The player renders this with the native `loop`
 * attribute (CameraPlayer.tsx) — it was already repeating regardless of
 * source length, so 120s only meant a ~10x larger file for the exact same
 * visual result a much shorter clip gives. Confirmed live via a real HAR
 * capture 2026-09-01 (vault/Tank/har-analysis-tank-vs-twitch-vs-kick-
 * 2026-09-01.md): this clip, served from an uncached Supabase Storage
 * origin, was taking 25-50 seconds to download and was the dominant cause
 * of "1.4 minutes to load a room" — six of these loading at once (one per
 * grid tile) starved the actual live stream of bandwidth. That fan-out is
 * fixed separately (CameraPlayer.tsx now only requests this for the hero
 * player, not thumbnails) — this shrinks the file itself, which helps the
 * one remaining real caller and every future one.
 */
export async function refreshCameraLoop(
  cam: SrtManagerCameraConfig,
  durationSeconds: number = 15
): Promise<RoomLoopRefreshResult> {
  const admin = createAdminClient();
  const streamId = `play/stream/${cam.streamUser}?srtauth=${cam.streamKey}`;
  const srtUrl = `srt://127.0.0.1:${cam.videoOutPort}?streamid=${streamId}&mode=caller`;
  const tempFile = join(tmpdir(), `tank_loop_${cam.id}_${Date.now()}.mp4`);

  try {
    // Capture live video via ffmpeg, 480p, veryfast, muted, faststart
    const ffmpegCmd = `ffmpeg -nostdin -y -t ${durationSeconds} -i "${srtUrl}" -an -c:v libx264 -preset veryfast -crf 28 -vf "scale=-2:480" -movflags +faststart "${tempFile}"`;

    execSync(ffmpegCmd, { stdio: "pipe", timeout: (durationSeconds + 30) * 1000 });

    if (!existsSync(tempFile)) {
      return {
        cameraId: cam.id,
        cameraName: cam.name,
        success: false,
        error: "FFmpeg did not generate output file.",
      };
    }

    const fileBytes = readFileSync(tempFile);
    if (fileBytes.length < 1000) {
      return {
        cameraId: cam.id,
        cameraName: cam.name,
        success: false,
        error: "Generated file is empty or corrupted.",
      };
    }

    // Overwrite the single file in tank-loops.
    //
    // cacheControl was never set before, so no downstream cache (browser or
    // any proxy layer in front of db.unenter.live) had a reason to hold onto
    // this after the first fetch — every repeat view re-paid the full
    // download cost. 300s balances that against the file being periodically
    // overwritten with fresher footage: long enough that a single viewing
    // session doesn't re-fetch it, short enough that "recent footage" stays
    // honest. Doesn't fix first-view latency (that's origin throughput, see
    // the har-analysis vault note's CDN recommendation — an infra change,
    // not made here) but removes the cost entirely for repeat views.
    const storagePath = `cameras/${cam.id}.mp4`;
    const { error: uploadErr } = await admin.storage
      .from(LOOP_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: "video/mp4",
        upsert: true,
        cacheControl: "300",
      });

    if (uploadErr) {
      return {
        cameraId: cam.id,
        cameraName: cam.name,
        success: false,
        error: uploadErr.message,
      };
    }

    return {
      cameraId: cam.id,
      cameraName: cam.name,
      success: true,
      fileSizeBytes: fileBytes.length,
      durationSeconds,
    };
  } catch (err: any) {
    return {
      cameraId: cam.id,
      cameraName: cam.name,
      success: false,
      error: err.message || String(err),
    };
  } finally {
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile);
      }
    } catch {}
  }
}

/**
 * Refreshes loop clips across all enabled online house cameras.
 */
export async function refreshAllRoomLoops(
  durationSeconds: number = 15
): Promise<RoomLoopRefreshResult[]> {
  const configs = await getLiveCameraConfigs();
  const results: RoomLoopRefreshResult[] = [];

  for (const cam of configs) {
    const result = await refreshCameraLoop(cam, durationSeconds);
    results.push(result);
  }

  return results;
}
