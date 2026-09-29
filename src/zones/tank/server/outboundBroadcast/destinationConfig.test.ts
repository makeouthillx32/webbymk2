import { describe, expect, test } from "bun:test";
import {
  buildMediaMtxForwards,
  parseOutboundBroadcastConfig,
  redactForwardDestination,
} from "./destinationConfig";
import { buildDirectorProgramForwardPatch } from "./mediaMtxConfig";

const streamKey = "live_secret_key_123";

describe("Tank outbound broadcast destination config", () => {
  test("builds multiple RTMPS forwards while keeping safe summaries secret-free", () => {
    const parsed = parseOutboundBroadcastConfig(JSON.stringify([
      {
        id: "youtube-main",
        label: "YouTube",
        platform: "youtube",
        rtmpUrl: "rtmps://a.rtmp.youtube.com/live2",
        streamKey,
      },
      {
        id: "twitch-main",
        label: "Twitch",
        platform: "twitch",
        enabled: false,
        rtmpUrl: "rtmps://ingest.example.test/app",
        streamKey: "another_secret",
      },
    ]));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected valid config");

    expect(parsed.summaries).toEqual([
      {
        id: "youtube-main",
        label: "YouTube",
        platform: "youtube",
        enabled: true,
        configured: true,
        host: "a.rtmp.youtube.com",
        encryptedInTransit: true,
      },
      {
        id: "twitch-main",
        label: "Twitch",
        platform: "twitch",
        enabled: false,
        configured: true,
        host: "ingest.example.test",
        encryptedInTransit: true,
      },
    ]);
    expect(JSON.stringify(parsed.summaries)).not.toContain(streamKey);
    expect(buildMediaMtxForwards(parsed.destinations)).toEqual([
      { dest: `rtmps://a.rtmp.youtube.com/live2#${streamKey}` },
    ]);
    expect(buildDirectorProgramForwardPatch(parsed.destinations)).toEqual({
      forward: [{ dest: `rtmps://a.rtmp.youtube.com/live2#${streamKey}` }],
    });
  });

  test("rejects accidental plaintext RTMP unless explicitly allowed", () => {
    const parsed = parseOutboundBroadcastConfig(JSON.stringify([
      {
        id: "custom",
        label: "Custom",
        platform: "custom",
        rtmpUrl: "rtmp://relay.example.test/live",
        streamKey,
      },
    ]));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected invalid config");
    expect(parsed.errors.join(" ")).toContain("must use encrypted RTMPS");
    expect(parsed.errors.join(" ")).not.toContain(streamKey);
  });

  test("rejects embedded credentials and stream keys in the URL", () => {
    const parsed = parseOutboundBroadcastConfig(JSON.stringify([
      {
        id: "bad-target",
        label: "Bad target",
        platform: "custom",
        rtmpUrl: "rtmps://user:password@relay.example.test/live#already-here",
        streamKey,
      },
    ]));

    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("expected invalid config");
    expect(parsed.errors).toContain(
      'destination "bad-target" must not put credentials in the RTMP URL.',
    );
    expect(parsed.errors).toContain(
      'destination "bad-target" must keep its stream key in streamKey, not in the RTMP URL.',
    );
  });

  test("redacts MediaMTX forward fragments", () => {
    expect(
      redactForwardDestination(`rtmps://relay.example.test/live#${streamKey}`),
    ).toBe("rtmps://relay.example.test/live#[REDACTED]");
  });
});
