import { createClient } from "@supabase/supabase-js";
import { config } from "./config";
import { cleanup, downloadAudio, normalizeAudio, playAudio } from "./audio";
import { synthesize } from "./tts";

type AudioRequest = {
  id: string;
  kind: "tts" | "sfx" | "hazard_effect";
  message: string | null;
  voice_or_sound_key: string;
  target_room_key: string;
  payload: Record<string, unknown>;
};

const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const roomKeys = Object.keys(config.roomSinks);
const activeRooms = new Set<string>();

async function finish(requestId: string, success: boolean, details: Record<string, unknown> = {}) {
  const { error } = await supabase.rpc("tank_finish_audio_request", {
    p_request_id: requestId,
    p_worker_id: config.workerId,
    p_success: success,
    p_error_message: details.errorMessage ?? null,
    p_generated_audio_path: details.generatedAudioPath ?? null,
    p_generated_audio_content_type: details.contentType ?? null,
    p_generated_audio_duration_ms: details.durationMs ?? null,
    p_tts_provider: details.ttsProvider ?? null,
  });
  if (error) console.error(`[tank-audio] could not finish ${requestId}: ${error.message}`);
}

async function processRequest(request: AudioRequest) {
  const roomKey = request.target_room_key;
  const sink = config.roomSinks[roomKey];
  let sourcePath: string | null = null;
  let normalizedPath: string | null = null;
  let provider: string | null = null;
  try {
    if (!sink) throw new Error(`No configured output sink for room ${roomKey}.`);
    if (request.kind === "hazard_effect") {
      await finish(request.id, true);
      return;
    }
    if (request.kind === "tts") {
      const generated = await synthesize(request.message ?? "", request.voice_or_sound_key);
      sourcePath = generated.path;
      provider = generated.provider;
    } else {
      const fileUrl = typeof request.payload.fileUrl === "string" ? request.payload.fileUrl : "";
      if (!fileUrl) throw new Error("SFX request has no approved file URL.");
      sourcePath = await downloadAudio(fileUrl, request.id);
    }
    const { data: activeEffect } = await supabase
      .from("tank_room_audio_effects")
      .select("effect_config")
      .eq("room_key", roomKey)
      .is("revoked_at", null)
      .lte("starts_at", new Date().toISOString())
      .gt("expires_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: room } = await supabase
      .from("tank_rooms")
      .select("audio_output_config")
      .eq("room_key", roomKey)
      .maybeSingle();
    const roomConfig = room?.audio_output_config && typeof room.audio_output_config === "object"
      ? room.audio_output_config as Record<string, unknown>
      : {};
    const roomPercent = typeof roomConfig.volume === "number"
      ? Math.max(0, Math.min(100, roomConfig.volume)) / 100
      : 1;
    const effectiveSink = { ...sink, volume: sink.volume * roomPercent };
    const effectConfig = activeEffect?.effect_config && typeof activeEffect.effect_config === "object"
      ? activeEffect.effect_config as Record<string, unknown>
      : {};
    normalizedPath = await normalizeAudio(sourcePath, request.id, { ...request.payload, ...effectConfig }, effectiveSink);
    await playAudio(normalizedPath, effectiveSink);
    await finish(request.id, true, {
      generatedAudioPath: request.kind === "tts" ? sourcePath : null,
      contentType: request.kind === "tts" ? "audio/mpeg" : null,
      ttsProvider: provider,
    });
  } catch (error) {
    const message = error instanceof AggregateError
      ? error.errors.map((entry) => entry instanceof Error ? entry.message : String(entry)).join("; ")
      : error instanceof Error ? error.message : String(error);
    console.error(`[tank-audio] ${request.id} failed: ${message}`);
    await finish(request.id, false, { errorMessage: message });
  } finally {
    activeRooms.delete(roomKey);
    const disposableSource = request.kind === "sfx" ? sourcePath : null;
    await cleanup(disposableSource, normalizedPath);
  }
}

async function claimOne() {
  const availableRooms = roomKeys.filter((roomKey) => !activeRooms.has(roomKey));
  if (availableRooms.length === 0 || activeRooms.size >= config.maxConcurrency) return false;
  const { data, error } = await supabase.rpc("tank_claim_audio_request", {
    p_worker_id: config.workerId,
    p_room_keys: availableRooms,
  });
  if (error) throw new Error(error.message);
  const request = Array.isArray(data) ? data[0] as AudioRequest | undefined : undefined;
  if (!request) return false;
  activeRooms.add(request.target_room_key);
  void processRequest(request);
  return true;
}

async function main() {
  if (roomKeys.length === 0) throw new Error("TANK_AUDIO_ROOM_SINKS is empty; refusing to claim room audio.");
  console.log(`[tank-audio] worker ${config.workerId} ready for rooms: ${roomKeys.join(", ")}`);
  await supabase.rpc("tank_requeue_stale_audio_requests");
  while (true) {
    try {
      let claimed = false;
      do { claimed = await claimOne(); } while (claimed && activeRooms.size < config.maxConcurrency);
    } catch (error) {
      console.error(`[tank-audio] queue poll failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    await Bun.sleep(config.pollMs);
  }
}

await main();
