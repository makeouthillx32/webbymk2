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
 * Captures a fresh 2-minute (120s) clip directly from a camera's live SRT stream
 * and overwrites its singular loop file in Supabase Storage.
 */
export async function refreshCameraLoop(
  cam: SrtManagerCameraConfig,
  durationSeconds: number = 120
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

    // Overwrite the single file in tank-loops
    const storagePath = `cameras/${cam.id}.mp4`;
    const { error: uploadErr } = await admin.storage
      .from(LOOP_BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: "video/mp4",
        upsert: true,
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
 * Refreshes 2-minute clips across all enabled online house cameras.
 */
export async function refreshAllRoomLoops(
  durationSeconds: number = 120
): Promise<RoomLoopRefreshResult[]> {
  const configs = await getLiveCameraConfigs();
  const results: RoomLoopRefreshResult[] = [];

  for (const cam of configs) {
    const result = await refreshCameraLoop(cam, durationSeconds);
    results.push(result);
  }

  return results;
}
