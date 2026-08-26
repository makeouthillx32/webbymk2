import { describe, expect, test } from "bun:test";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";
import { toPublicCameraDirectory } from "./publicCameraProjection";

const baseCamera: DiscoveredCamera = {
  id: "cam-1786768240090",
  slug: "cam-1786768240090",
  name: "Cam0",
  protocol: "ip-camera",
  roomScope: "game-room",
  tags: ["fixed", "game-room", "director-eligible"],
  presence: "online",
  publicVisible: true,
  directorAssigned: true,
  enabled: true,
  receiverReady: true,
  bitrateKbps: 7000,
  latencyMs: 0.1,
  reason: "Camera health excellent",
  sampledAt: "2026-08-14T00:00:00.000Z",
  disconnectedAt: null,
  retireAt: null,
  reconnectSecondsRemaining: null,
  keyFingerprint: "private-fingerprint",
  sceneKey: "camera:cam-1786768240090",
  sceneAction: "none",
  playbackUrl: null,
  playbackProtocol: "none",
  audioMode: "embedded",
  audioStatus: "transcode-required",
  audioWarning: "PCM A-law requires browser transcoding.",
  nativeAudioMuted: false,
};

describe("public Tank camera API projection", () => {
  test("keeps media scope while removing admin catalog and credential fingerprint", () => {
    const snapshot: CameraDirectorySnapshot = {
      source: "receiver-manager",
      generatedAt: "2026-08-14T00:00:00.000Z",
      gracePeriodSeconds: 90,
      cameras: [baseCamera, { ...baseCamera, id: "private", publicVisible: false }],
      audioSources: [{
        id: "private-mic",
        name: "Private Mic",
        roomScope: "game-room",
        online: true,
        codec: "opus",
        channels: 1,
        sampleRateHz: 48000,
        tags: [],
      }],
    };
    const result = toPublicCameraDirectory(snapshot);
    const serialized = JSON.stringify(result);

    expect(result.cameras).toHaveLength(1);
    expect(result.cameras[0].roomScope).toBe("game-room");
    expect(result.cameras[0].audioMode).toBe("embedded");
    expect(result.cameras[0].tags).toEqual(["fixed", "game-room", "director-eligible"]);
    expect(serialized).not.toContain("private-fingerprint");
    expect(serialized).not.toContain("private-mic");
    expect(serialized).not.toContain("streamKey");
    expect(serialized).not.toContain("srtauth");
  });
});
