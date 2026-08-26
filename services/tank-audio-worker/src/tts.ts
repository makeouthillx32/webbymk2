import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config, type TtsProviderName } from "./config";

export type SynthesizedAudio = {
  path: string;
  provider: TtsProviderName;
  contentType: string;
  cacheKey: string;
};

function cacheKey(text: string, voiceKey: string) {
  return createHash("sha256")
    .update(JSON.stringify({
      text,
      voiceKey,
      providerOrder: config.ttsProviderOrder,
      fishModel: config.fishAudioModel,
      fishVoice: config.fishAudioVoices[voiceKey] ?? config.fishAudioDefaultVoiceId,
      fishLatency: config.fishAudioLatency,
      elevenModel: config.elevenLabsModelId,
      elevenVoice: config.ttsVoices[voiceKey] ?? config.ttsVoices.default,
      localModel: config.localTtsModel,
      localVoice: config.ttsVoices[voiceKey] ?? config.localTtsVoice,
      output: "mp3",
    }))
    .digest("hex");
}

async function usableCache(path: string, metadataPath: string): Promise<TtsProviderName | null> {
  try {
    if ((await readFile(path)).byteLength === 0) return null;
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as { provider?: unknown };
    return config.ttsProviderOrder.includes(metadata.provider as TtsProviderName)
      ? metadata.provider as TtsProviderName
      : null;
  } catch {
    return null;
  }
}

function checkedBaseUrl(value: string) {
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "fish-speech", "unt_fish_speech"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error("Fish Audio must use HTTPS or an approved local inference host.");
  }
  return url;
}

async function fishAudio(text: string, voiceKey: string) {
  if (!config.fishAudioApiKey) throw new Error("Fish Audio is not configured.");
  const referenceId = config.fishAudioVoices[voiceKey] ?? config.fishAudioDefaultVoiceId;
  if (!referenceId) throw new Error(`No Fish Audio voice is mapped for alias ${voiceKey}.`);
  const endpoint = new URL("/v1/tts", checkedBaseUrl(config.fishAudioBaseUrl));
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.fishAudioApiKey}`,
      "Content-Type": "application/json",
      "model": config.fishAudioModel,
    },
    body: JSON.stringify({
      text,
      reference_id: referenceId,
      format: "mp3",
      sample_rate: 44_100,
      mp3_bitrate: 128,
      latency: config.fishAudioLatency,
      normalize: true,
      prosody: { speed: 1, volume: 0, normalize_loudness: true },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Fish Audio returned HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function elevenLabs(text: string, voiceKey: string) {
  if (!config.elevenLabsApiKey) throw new Error("ElevenLabs is not configured.");
  const voiceId = config.ttsVoices[voiceKey] ?? config.ttsVoices.default;
  if (!voiceId) throw new Error(`No ElevenLabs voice is mapped for alias ${voiceKey}.`);
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": config.elevenLabsApiKey },
    body: JSON.stringify({ text, model_id: config.elevenLabsModelId, output_format: "mp3_44100_128" }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`ElevenLabs returned HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function localTts(text: string, voiceKey: string) {
  if (!config.localTtsBaseUrl) throw new Error("Local TTS is not configured.");
  const response = await fetch(`${config.localTtsBaseUrl}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.localTtsModel, voice: config.ttsVoices[voiceKey] ?? config.localTtsVoice, input: text, response_format: "mp3" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Local TTS returned HTTP ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

const providers: Record<TtsProviderName, (text: string, voiceKey: string) => Promise<Uint8Array>> = {
  "fish-audio": fishAudio,
  elevenlabs: elevenLabs,
  local: localTts,
};

export async function synthesize(text: string, voiceKey: string): Promise<SynthesizedAudio> {
  const key = cacheKey(text, voiceKey);
  await mkdir(config.cacheDir, { recursive: true });
  const path = join(config.cacheDir, `${key}.mp3`);
  const metadataPath = join(config.cacheDir, `${key}.json`);
  const cachedProvider = await usableCache(path, metadataPath);
  if (cachedProvider) {
    return { path, provider: cachedProvider, contentType: "audio/mpeg", cacheKey: key };
  }

  const failures: Error[] = [];
  for (const provider of config.ttsProviderOrder) {
    try {
      const bytes = await providers[provider](text, voiceKey);
      if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
        throw new Error(`${provider} returned an invalid TTS output size.`);
      }
      await writeFile(path, bytes, { mode: 0o600 });
      await writeFile(metadataPath, JSON.stringify({ provider, contentType: "audio/mpeg" }), { mode: 0o600 });
      return { path, provider, contentType: "audio/mpeg", cacheKey: key };
    } catch (error) {
      failures.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  throw new AggregateError(failures, "All configured TTS providers failed.");
}
