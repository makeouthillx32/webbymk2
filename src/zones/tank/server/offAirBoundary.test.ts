import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";
import type { RoomPresentationRow } from "./cameraRegistryDb";
import { deriveOffAirRooms, deriveRooms } from "./roomProjection";
import { toPublicCameraDirectory, toStaffCameraDirectory } from "./publicCameraProjection";
import { isOnAirCamera } from "./serverDirectorEngine";

// "Off for Tank" (tank_rooms.is_offline) hides a room from viewers. It must not
// turn the room into a ghost for staff: ingest, vision and Axis keep running,
// and the house console keeps seeing it. And nothing staff can see may reach
// the programme.

const camera = (id: string, roomScope: string): DiscoveredCamera => ({
  id,
  slug: id,
  name: id,
  protocol: "ip-camera",
  roomScope,
  tags: [],
  presence: "online",
  publicVisible: true,
  directorAssigned: true,
  enabled: true,
  receiverReady: true,
  bitrateKbps: 7000,
  latencyMs: 0.1,
  reason: "ok",
  sampledAt: "2026-11-04T00:00:00.000Z",
  disconnectedAt: null,
  retireAt: null,
  reconnectSecondsRemaining: null,
  keyFingerprint: "private-fingerprint",
  sceneKey: `camera:${id}`,
  sceneAction: "none",
  playbackUrl: `https://media.example/${id}/whep`,
  playbackProtocol: "whep",
  audioMode: "embedded",
  audioStatus: "embedded",
  audioWarning: null,
  nativeAudioMuted: false,
} as DiscoveredCamera);

const row = (roomKey: string, isOffline: boolean): RoomPresentationRow => ({
  roomKey,
  title: roomKey,
  eyebrow: null,
  description: null,
  tags: [],
  visibilityPolicy: "always",
  audioOutputKind: "embedded",
  audioOutputConfig: {},
  audioInputSourceId: null,
  isOffline,
});

const cameras = [camera("cam-kitchen", "kitchen"), camera("cam-living", "living-room")];
const presentation = [row("kitchen", false), row("living-room", true)];

function snapshot(): CameraDirectorySnapshot {
  return {
    source: "receiver-manager",
    generatedAt: "2026-11-04T00:00:00.000Z",
    gracePeriodSeconds: 90,
    cameras,
    rooms: deriveRooms(cameras, presentation),
    offlineRoomKeys: ["living-room"],
    offAirRooms: deriveOffAirRooms(cameras, presentation),
  };
}

describe("off for Tank, not off for staff", () => {
  test("a switched-off room is derived separately and tagged offAir", () => {
    expect(deriveRooms(cameras, presentation).map((r) => r.roomKey)).toEqual(["kitchen"]);
    const offAir = deriveOffAirRooms(cameras, presentation);
    expect(offAir.map((r) => r.roomKey)).toEqual(["living-room"]);
    expect(offAir[0].offAir).toBe(true);
    expect(deriveRooms(cameras, presentation)[0].offAir).toBeUndefined();
  });

  test("viewers get nothing about the off-air room, not even that it exists", () => {
    const pub = toPublicCameraDirectory(snapshot());
    const serialized = JSON.stringify(pub);
    expect(pub.rooms.map((r) => r.roomKey)).toEqual(["kitchen"]);
    expect(pub.cameras.map((c) => c.id)).toEqual(["cam-kitchen"]);
    expect(serialized).not.toContain("living-room");
    expect(serialized).not.toContain("cam-living");
    expect(serialized).not.toContain("offAir");
  });

  test("staff keep the off-air room and its cameras, without credentials", () => {
    const staff = toStaffCameraDirectory(snapshot());
    const serialized = JSON.stringify(staff);
    expect(staff.rooms.map((r) => [r.roomKey, Boolean(r.offAir)])).toEqual([
      ["kitchen", false],
      ["living-room", true],
    ]);
    expect(staff.cameras.map((c) => c.id).sort()).toEqual(["cam-kitchen", "cam-living"]);
    expect(serialized).not.toContain("private-fingerprint");
    expect(staff.offlineRoomKeys).toBeUndefined();
    expect(staff.offAirRooms).toBeUndefined();
  });

  test("only on-air cameras can be put on the programme", () => {
    const onAir = new Set(toPublicCameraDirectory(snapshot()).cameras.map((c) => c.id));
    expect(isOnAirCamera("cam-kitchen", onAir)).toBe(true);
    expect(isOnAirCamera("cam-living", onAir)).toBe(false);
    expect(isOnAirCamera("", onAir)).toBe(false);
  });

  test("the director guards pilot leases and camera locks, and goes GAME with nothing on air", () => {
    const source = readFileSync(join(import.meta.dir, "serverDirectorEngine.ts"), "utf8");
    expect(source).toContain("isOnAirCamera(pilotLease.activeCameraId, onAirIds)");
    expect(source).toContain('attentionLock.targetType !== "camera" || isOnAirCamera(attentionLock.targetId, onAirIds)');
    // GAME is decided from the PUBLIC projection, before any branch can pick a camera.
    const game = source.search(/mode: "GAME",\s+ptzState: null,\s+dwellSecondsRemaining: 0,\s+switchedAt: entering/);
    expect(game).toBeGreaterThan(-1);
    expect(game).toBeGreaterThan(source.indexOf("toPublicCameraDirectory(rawSnapshot)"));
    expect(game).toBeLessThan(source.indexOf("const pilotLease = await getActivePilotLease()"));
    // The boot state no longer claims a camera.
    expect(source).not.toContain('activeCameraId: "cam-1786768240090"');
  });

  test("the house console reads the staff directory; viewers' surfaces don't", () => {
    const house = readFileSync(join(import.meta.dir, "..", "house", "HouseConsole.tsx"), "utf8");
    expect(house).toContain('useTankCameras("staff")');
    // The director console is staff too. On the public list, every room off
    // for Tank meant fixture cameras and "no signal" on every tile.
    const director = readFileSync(
      join(import.meta.dir, "..", "director-configuration", "components", "DirectorWorkspace", "DirectorWorkspace.tsx"),
      "utf8",
    );
    expect(director).toContain('useTankCameras("staff")');
    const route = readFileSync(join(import.meta.dir, "..", "..", "..", "app", "api", "tank", "staff", "cameras", "route.ts"), "utf8");
    expect(route).toContain("checkStaff()");
    expect(route).toContain("toStaffCameraDirectory(snapshot)");
    const pub = readFileSync(join(import.meta.dir, "..", "..", "..", "app", "api", "tank", "cameras", "route.ts"), "utf8");
    expect(pub).toContain("toPublicCameraDirectory(snapshot)");
  });
});
