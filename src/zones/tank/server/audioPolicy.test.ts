import { describe, expect, test } from "bun:test";
import type { TankAudioSource } from "../contracts";
import {
  requiresBrowserAudioWorker,
  resolveCameraAudio,
  validateAudioAssignment,
} from "./audioPolicy";

const gameRoomMic: TankAudioSource = {
  id: "game-room-mic",
  name: "Game Room Mic",
  roomScope: "game-room",
  online: true,
  codec: "opus",
  channels: 2,
  sampleRateHz: 48000,
  tags: [],
};

const sharedHouseMic: TankAudioSource = {
  ...gameRoomMic,
  id: "house-main-mic",
  name: "House Main Mic",
  roomScope: "house",
  tags: ["shared-audio"],
};

describe("Tank camera audio resolution", () => {
  test("keeps Cam0 embedded audio and marks its browser transcode boundary", () => {
    const audio = resolveCameraAudio({
      cameraId: "cam-1786768240090",
      roomScope: "game-room",
      declaredMode: "embedded",
      sources: [],
      probe: { present: true, codec: "pcm_alaw" },
    });
    expect(audio.status).toBe("transcode-required");
    expect(audio.nativeAudioMuted).toBe(false);
    expect(audio.warning).toContain("Opus");
    expect(requiresBrowserAudioWorker(audio.status)).toBe(true);
  });

  test("keeps video live as missing-audio when an external mic is offline", () => {
    const audio = resolveCameraAudio({
      cameraId: "remote-cam-1",
      roomScope: "game-room",
      declaredMode: "external",
      declaredSourceId: "game-room-mic",
      sources: [{ ...gameRoomMic, online: false }],
    });
    expect(audio.status).toBe("missing-audio");
    expect(audio.warning).toContain("video remains live");
  });

  test("warns when automatic probing cannot resolve audio", () => {
    const audio = resolveCameraAudio({
      cameraId: "future-camera",
      roomScope: "unscoped",
      declaredMode: "auto",
      sources: [],
    });
    expect(audio.status).toBe("probe-required");
  });
});

describe("Tank external audio assignment guardrails", () => {
  const embeddedCamera = {
    roomScope: "game-room",
    audioMode: "embedded" as const,
    audioStatus: "embedded" as const,
  };

  test("requires explicit native-audio replacement", () => {
    const result = validateAudioAssignment({
      camera: embeddedCamera,
      source: gameRoomMic,
      replaceNative: false,
      confirmCrossRoom: false,
    });
    expect(result.ok).toBe(false);
  });

  test("rejects a cross-room microphone without shared-audio", () => {
    const result = validateAudioAssignment({
      camera: { ...embeddedCamera, audioMode: "none", audioStatus: "silent" },
      source: { ...gameRoomMic, roomScope: "roaming" },
      replaceNative: false,
      confirmCrossRoom: true,
    });
    expect(result.ok).toBe(false);
  });

  test("requires confirmation for a shared cross-room microphone", () => {
    const unconfirmed = validateAudioAssignment({
      camera: { ...embeddedCamera, audioMode: "none", audioStatus: "silent" },
      source: sharedHouseMic,
      replaceNative: false,
      confirmCrossRoom: false,
    });
    const confirmed = validateAudioAssignment({
      camera: { ...embeddedCamera, audioMode: "none", audioStatus: "silent" },
      source: sharedHouseMic,
      replaceNative: false,
      confirmCrossRoom: true,
    });
    expect(unconfirmed.ok).toBe(false);
    expect(confirmed).toEqual({
      ok: true,
      nativeAudioMuted: false,
      crossRoomConfirmed: true,
    });
  });
});
