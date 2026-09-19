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

// The room kill-switch (tank_rooms.is_offline) promises that "nothing about an
// offline room, including its camera URLs, ever leaves the server". deriveRooms
// held up its half by omitting the room; this projection did not, so a room
// switched off went dark in the grid while its cameras kept streaming out of
// /api/tank/cameras with a live WHEP URL attached. Observed on production
// 2026-09-10 after game-room and game-room-2 were toggled off.
describe("offline room kill-switch", () => {
  const liveUrl = "https://media.tank.unenter.live/cameras/cam-1786768240090/whep";

  const snapshotWith = (offlineRoomKeys?: string[]): CameraDirectorySnapshot => ({
    source: "receiver-manager",
    generatedAt: "2026-09-10T00:00:00.000Z",
    gracePeriodSeconds: 90,
    rooms: [],
    cameras: [
      { ...baseCamera, roomScope: "game-room", playbackUrl: liveUrl, playbackProtocol: "whep" },
      {
        ...baseCamera,
        id: "cam-living",
        slug: "cam-living",
        roomScope: "living-room",
        sceneKey: "camera:cam-living",
      },
    ],
    ...(offlineRoomKeys ? { offlineRoomKeys } : {}),
  });

  test("a switched-off room's cameras are dropped entirely", () => {
    const result = toPublicCameraDirectory(snapshotWith(["game-room"]));
    expect(result.cameras).toHaveLength(1);
    expect(result.cameras[0].roomScope).toBe("living-room");
  });

  test("the offline room's playback URL does not leave the server", () => {
    // The actual safety property. A camera merely flagged offline while still
    // carrying a live WHEP URL is exactly the failure this guards.
    const serialized = JSON.stringify(toPublicCameraDirectory(snapshotWith(["game-room"])));
    expect(serialized).not.toContain(liveUrl);
    expect(serialized).not.toContain("cam-1786768240090");
  });

  test("rooms that are on are untouched", () => {
    const result = toPublicCameraDirectory(snapshotWith(["makeup-room"]));
    expect(result.cameras).toHaveLength(2);
  });

  test("several rooms can be off at once", () => {
    const result = toPublicCameraDirectory(snapshotWith(["game-room", "living-room"]));
    expect(result.cameras).toHaveLength(0);
  });

  test("which rooms are off is not disclosed publicly", () => {
    const result = toPublicCameraDirectory(snapshotWith(["game-room"]));
    expect(result.offlineRoomKeys).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("offlineRoomKeys");
  });

  test("FAILS OPEN: no offlineRoomKeys means no filtering, never a blank site", () => {
    // Deliberate. Deriving the offline set by diffing against `rooms` would
    // fail closed here — `rooms` is empty — and hide every camera on the site.
    const result = toPublicCameraDirectory(snapshotWith(undefined));
    expect(result.cameras).toHaveLength(2);
  });

  test("an empty offline list filters nothing", () => {
    expect(toPublicCameraDirectory(snapshotWith([])).cameras).toHaveLength(2);
  });

  test("a non-public camera in an online room is still dropped", () => {
    const snapshot = snapshotWith(["game-room"]);
    snapshot.cameras.push({ ...baseCamera, id: "hidden", roomScope: "living-room", publicVisible: false });
    const result = toPublicCameraDirectory(snapshot);
    expect(result.cameras.map((c) => c.id)).toEqual(["cam-living"]);
  });
});
