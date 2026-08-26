import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SUPABASE_URL ||= "https://db.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";

const { config } = await import("./config");
const { synthesize } = await import("./tts");

const originalFetch = globalThis.fetch;
const cacheDir = await mkdtemp(join(tmpdir(), "tank-tts-test-"));

beforeEach(() => {
  config.cacheDir = cacheDir;
  config.ttsProviderOrder = ["fish-audio", "elevenlabs", "local"];
  config.fishAudioApiKey = "test-fish-key";
  config.fishAudioBaseUrl = "https://api.fish.audio";
  config.fishAudioModel = "s2.1-pro-free";
  config.fishAudioVoices = { default: "fish-reference" };
  config.fishAudioDefaultVoiceId = "fish-reference";
  config.elevenLabsApiKey = "test-eleven-key";
  config.ttsVoices = { default: "eleven-reference" };
  config.localTtsBaseUrl = "http://localhost:9999";
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("Tank Fish Audio provider", () => {
  test("sends approved reference IDs and inline emotion text only to Fish server-side", async () => {
    let captured: { url: string; authorization: string | null; model: string | null; body: any } | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      captured = {
        url: String(input),
        authorization: headers.get("authorization"),
        model: headers.get("model"),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    }) as unknown as typeof fetch;

    const result = await synthesize("[whisper] welcome to Tank", "default");
    expect(result.provider).toBe("fish-audio");
    expect(captured).toMatchObject({
      url: "https://api.fish.audio/v1/tts",
      authorization: "Bearer test-fish-key",
      model: "s2.1-pro-free",
      body: {
        text: "[whisper] welcome to Tank",
        reference_id: "fish-reference",
        format: "mp3",
        latency: "balanced",
      },
    });
  });

  test("falls through to ElevenLabs when Fish is unavailable", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("api.fish.audio")) return new Response("busy", { status: 503 });
      return new Response(new Uint8Array([4, 5, 6]), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await synthesize("unique fallback sentence", "default");
    expect(result.provider).toBe("elevenlabs");
  });

  test("cache hits retain the provider that generated the bytes", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(new Uint8Array([7, 8, 9]), { status: 200 });
    }) as unknown as typeof fetch;

    const first = await synthesize("unique cached sentence", "default");
    const second = await synthesize("unique cached sentence", "default");
    expect(first.provider).toBe("fish-audio");
    expect(second.provider).toBe("fish-audio");
    expect(calls).toBe(1);
  });
});
