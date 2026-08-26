import { createAdminClient } from "@/utils/supabase/admin";
import type { TankAudioSource } from "../contracts";

// Read-only data access over tank_audio_sources (added in
// supabase/migrations/20260815051500_tank_camera_audio_routing.sql). This is
// the real catalog of external audio sources (IP mics, house mics, mixer
// line-ins) operators can bind to a camera whose own feed has no usable
// audio — it replaces the hardcoded array that used to live directly in
// admin/LiveCameraRegistry.tsx and never touched the database.

export type { TankAudioSource } from "../contracts";

export async function getAudioSourceCatalog(): Promise<TankAudioSource[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tank_audio_sources")
      .select("id, name, room_scope, online, codec, channels, sample_rate_hz, tags, kind, connection_hint, stream_url")
      .order("name", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      roomScope: row.room_scope ?? "unscoped",
      online: row.online === true,
      codec: row.codec ?? null,
      channels: row.channels ?? null,
      sampleRateHz: row.sample_rate_hz ?? null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      kind: row.kind as TankAudioSource["kind"],
      connectionHint: row.connection_hint ?? null,
      streamUrl: row.stream_url ?? row.connection_hint ?? null,
    }));
  } catch {
    return [];
  }
}
