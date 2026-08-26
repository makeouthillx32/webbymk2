// src/zones/tank/server/obsIngestActions.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tank OBS Stream Room & Ingest Provisioning Actions
//
// Allows Admins & Moderators in /house to spin up dedicated broadcast rooms
// with authentic Tank stream keys and RTMP/SRT/WHEP credentials for OBS Studio.
// ─────────────────────────────────────────────────────────────────────────────

"use server";

import crypto from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { requireTankStaff } from "../house/requireTankStaff";

export type CreateObsRoomResult = {
  success: boolean;
  roomId?: string;
  roomSlug?: string;
  streamKey?: string;
  rtmpUrl?: string;
  srtUrl?: string;
  whipUrl?: string;
  error?: string;
};

export type ObsRoomDetails = {
  id: string;
  slug: string;
  title: string;
  description: string;
  streamKey: string;
  rtmpUrl: string;
  srtUrl: string;
  whipUrl: string;
  status: "online" | "standby" | "offline";
  createdAt: string;
};

/**
 * createObsStreamRoom
 * 
 * Creates a new broadcast room in tank_rooms and provisions an ingest stream key
 * in tank_camera_registry for OBS Studio live production.
 */
export async function createObsStreamRoom(
  title: string,
  slugInput?: string,
  description?: string
): Promise<CreateObsRoomResult> {
  try {
    await requireTankStaff();

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { success: false, error: "Room title is required." };
    }

    const slug = (slugInput || cleanTitle)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-|-$/g, "");

    const cameraId = `cam-obs-${slug}`;
    const rawKey = crypto.randomBytes(12).toString("hex");
    const streamKey = `tank_sk_${rawKey}`;
    const keyFingerprint = crypto.createHash("sha256").update(streamKey).digest("hex").slice(0, 10);

    const rtmpBase = process.env.TANK_RTMP_INGEST_URL || "rtmp://ingest.tank.unenter.live/live";
    const srtBase = process.env.TANK_SRT_INGEST_URL || "srt://ingest.tank.unenter.live:1935";
    const whipBase = process.env.TANK_WHIP_INGEST_URL || "https://media.tank.unenter.live/whip";

    const rtmpUrl = `${rtmpBase}`;
    const srtUrl = `${srtBase}?streamid=publish/cameras/${cameraId}?srtauth=${streamKey}`;
    const whipUrl = `${whipBase}/cameras/${cameraId}`;

    const admin = createAdminClient();

    // 1. Insert/Upsert into tank_rooms
    const { error: roomError } = await admin.from("tank_rooms").upsert(
      {
        id: slug,
        slug,
        title: cleanTitle,
        description: description || `Live OBS Production feed for ${cleanTitle}`,
        camera_ids: [cameraId],
        featured_camera_id: cameraId,
        live: true,
        viewers: 0,
        tags: ["obs-stream", "external-broadcast", "live"],
        audio_output_kind: "embedded",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (roomError) {
      return { success: false, error: `Failed to create room: ${roomError.message}` };
    }

    // 2. Insert/Upsert into tank_camera_registry
    const { error: camError } = await admin.from("tank_camera_registry").upsert(
      {
        camera_id: cameraId,
        name: cleanTitle,
        stream_key: streamKey,
        protocol: "rtmp",
        status: "standby",
        public_visible: true,
        has_been_live: false,
        bitrate_kbps: 0,
        latency_ms: null,
        key_fingerprint: keyFingerprint,
        audio_mode: "embedded",
        room_scope: slug,
        tags: ["obs", "external", "director-eligible"],
        audio_status: "embedded",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "camera_id" }
    );

    if (camError) {
      return { success: false, error: `Failed to register camera: ${camError.message}` };
    }

    return {
      success: true,
      roomId: slug,
      roomSlug: slug,
      streamKey,
      rtmpUrl,
      srtUrl,
      whipUrl,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create OBS stream room.",
    };
  }
}

/**
 * listObsStreamRooms
 * 
 * Fetches all rooms provisioned for external OBS / SRT stream ingest.
 */
export async function listObsStreamRooms(): Promise<ObsRoomDetails[]> {
  try {
    const admin = createAdminClient();
    const [{ data: rooms }, { data: cameras }] = await Promise.all([
      admin.from("tank_rooms").select("*").contains("tags", ["obs-stream"]),
      admin.from("tank_camera_registry").select("*").contains("tags", ["obs"]),
    ]);

    const camMap = new Map((cameras || []).map((c) => [c.camera_id, c]));
    const rtmpBase = process.env.TANK_RTMP_INGEST_URL || "rtmp://ingest.tank.unenter.live/live";
    const srtBase = process.env.TANK_SRT_INGEST_URL || "srt://ingest.tank.unenter.live:1935";
    const whipBase = process.env.TANK_WHIP_INGEST_URL || "https://media.tank.unenter.live/whip";

    return (rooms || []).map((r) => {
      const camId = `cam-obs-${r.slug}`;
      const cam = camMap.get(camId);
      const streamKey = cam?.stream_key || "tank_sk_live";

      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        description: r.description || "",
        streamKey,
        rtmpUrl: rtmpBase,
        srtUrl: `${srtBase}?streamid=publish/cameras/${camId}?srtauth=${streamKey}`,
        whipUrl: `${whipBase}/cameras/${camId}`,
        status: (cam?.status as any) || "standby",
        createdAt: r.created_at || new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}
