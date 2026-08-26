import { describe, expect, test } from "bun:test";
import { authorizePublish, OBS_PATH_PREFIX, resolveObsRoomReadiness, type ObsRoom } from "./obsRooms";

const REGISTERED_ROOM: ObsRoom = {
  id: "room-1",
  ownerUserId: "user-1",
  slug: "admin",
  title: "Admin",
  isLive: false,
  whepReady: false,
  lastSignalAt: null,
};

describe("OBS ingest path namespace", () => {
  // The regex in mediamtx.yml that scopes the lifecycle hooks to OBS rooms.
  // If these drift apart, a publish either gets no hooks (ghost rooms that
  // never disappear) or the hooks fire for camera paths too.
  const MEDIAMTX_OBS_PATH = /^obs\/[a-z0-9][a-z0-9-]*$/;

  test("slugs Tank can mint are accepted by the MediaMTX path regex", () => {
    for (const slug of ["skillet", "admin-2", "a1", "room-abc123"]) {
      expect(MEDIAMTX_OBS_PATH.test(`${OBS_PATH_PREFIX}/${slug}`)).toBe(true);
    }
  });

  test("camera paths never match the OBS namespace", () => {
    // A camera path matching here would attach OBS lifecycle hooks to a house
    // camera and let Tank mark it live/offline as if it were an OBS room.
    for (const path of ["cameras/cam-1786768240090", "cameras/cam-irl-1-hls"]) {
      expect(MEDIAMTX_OBS_PATH.test(path)).toBe(false);
    }
  });

  test("path traversal and uppercase are rejected", () => {
    for (const bad of ["obs/../cameras/cam-1", "obs/UPPER", "obs/", "obs/-lead"]) {
      expect(MEDIAMTX_OBS_PATH.test(bad)).toBe(false);
    }
  });

  test("permits the scoped internal WHEP sibling without a user stream key", async () => {
    const result = await authorizePublish({
      path: "obs/admin-whep",
      user: "",
      password: "",
      ip: "127.0.0.1",
      action: "publish",
    });
    expect(result.allowed).toBe(true);
  });
});

describe("OBS room readiness reconciliation", () => {
  test("recovers a publishing room whose database liveness is false", () => {
    expect(resolveObsRoomReadiness(REGISTERED_ROOM, true, true)).toMatchObject({
      isLive: true,
      whepReady: true,
    });
  });

  test("clears a stale live row and its WHEP readiness", () => {
    expect(resolveObsRoomReadiness({ ...REGISTERED_ROOM, isLive: true, whepReady: true }, false, true))
      .toMatchObject({ isLive: false, whepReady: false });
  });

  test("preserves database liveness when MediaMTX cannot answer", () => {
    expect(resolveObsRoomReadiness({ ...REGISTERED_ROOM, isLive: true }, null, false))
      .toMatchObject({ isLive: true, whepReady: false });
  });
});
