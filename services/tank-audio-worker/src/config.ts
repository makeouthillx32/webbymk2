export type RoomSink = {
  driver: "pipewire" | "pulse" | "ffplay" | "wasapi";
  sink?: string;
  volume: number;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function integer(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function parseRecord<T>(name: string, fallback: Record<string, T>): Record<string, T> {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be a JSON object.`);
  return value as Record<string, T>;
}

export type TtsProviderName = "fish-audio" | "elevenlabs" | "local";

function parseProviderOrder(): TtsProviderName[] {
  const raw = process.env.TANK_TTS_PROVIDER_ORDER?.trim() || "fish-audio,elevenlabs,local";
  const allowed = new Set<TtsProviderName>(["fish-audio", "elevenlabs", "local"]);
  const providers = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is TtsProviderName => allowed.has(entry as TtsProviderName));
  if (providers.length === 0) {
    throw new Error("TANK_TTS_PROVIDER_ORDER must include fish-audio, elevenlabs, or local.");
  }
  return [...new Set(providers)];
}

const rawSinks = parseRecord<Partial<RoomSink>>("TANK_AUDIO_ROOM_SINKS", {});
const roomSinks = Object.fromEntries(Object.entries(rawSinks).map(([roomKey, sink]) => {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(roomKey)) throw new Error(`Invalid room key in TANK_AUDIO_ROOM_SINKS: ${roomKey}`);
  if (!sink || !["pipewire", "pulse", "ffplay", "wasapi"].includes(String(sink.driver))) {
    throw new Error(`Invalid playback driver for ${roomKey}.`);
  }
  return [roomKey, {
    driver: sink.driver as RoomSink["driver"],
    sink: typeof sink.sink === "string" ? sink.sink : undefined,
    volume: Math.max(0, Math.min(1, Number(sink.volume ?? 1))),
  } satisfies RoomSink];
}));

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  workerId: process.env.TANK_AUDIO_WORKER_ID?.trim() || `tank-audio-${crypto.randomUUID()}`,
  cacheDir: process.env.TANK_AUDIO_CACHE_DIR?.trim() || "./.cache",
  pollMs: integer("TANK_AUDIO_POLL_MS", 750, 250, 10_000),
  maxConcurrency: integer("TANK_AUDIO_MAX_CONCURRENCY", 4, 1, 16),
  roomSinks,
  wasapiPlayer: process.env.TANK_AUDIO_WASAPI_PLAYER?.trim() || null,
  ttsProviderOrder: parseProviderOrder(),
  fishAudioApiKey: process.env.FISH_AUDIO_API_KEY?.trim() || null,
  fishAudioBaseUrl: process.env.FISH_AUDIO_BASE_URL?.trim().replace(/\/$/, "") || "https://api.fish.audio",
  fishAudioModel: process.env.FISH_AUDIO_MODEL?.trim() || "s2.1-pro-free",
  fishAudioVoices: parseRecord<string>("FISH_AUDIO_VOICES", {}),
  fishAudioDefaultVoiceId: process.env.FISH_AUDIO_DEFAULT_VOICE_ID?.trim() || null,
  fishAudioLatency: ["low", "balanced", "normal"].includes(process.env.FISH_AUDIO_LATENCY ?? "")
    ? process.env.FISH_AUDIO_LATENCY as "low" | "balanced" | "normal"
    : "balanced",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || null,
  elevenLabsModelId: process.env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
  ttsVoices: parseRecord<string>("TANK_TTS_VOICES", {}),
  localTtsBaseUrl: process.env.LOCAL_TTS_BASE_URL?.trim().replace(/\/$/, "") || null,
  localTtsModel: process.env.LOCAL_TTS_MODEL?.trim() || "kokoro",
  localTtsVoice: process.env.LOCAL_TTS_VOICE?.trim() || "af_heart",
};
