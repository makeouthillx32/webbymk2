import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { projectObsRoomCamera } from "./obsRoomProjection";
import type { ObsRoom } from "./obsRooms";

const ROOM: ObsRoom = {
  id: "room-1",
  ownerUserId: "user-1",
  slug: "admin",
  title: "Admin",
  isLive: false,
  whepReady: false,
  lastSignalAt: "2026-08-23T20:00:00.000Z",
};

const previousWhep = process.env.TANK_WHEP_PUBLIC_BASE_URL;
const previousHls = process.env.TANK_HLS_PUBLIC_BASE_URL;

beforeEach(() => {
  process.env.TANK_WHEP_PUBLIC_BASE_URL = "https://media.tank.unenter.live/webrtc";
  process.env.TANK_HLS_PUBLIC_BASE_URL = "https://media.tank.unenter.live/hls";
});

afterEach(() => {
  process.env.TANK_WHEP_PUBLIC_BASE_URL = previousWhep;
  process.env.TANK_HLS_PUBLIC_BASE_URL = previousHls;
});

describe("registered OBS room projection", () => {
  test("projects an offline room as standby so always-show can preserve it", () => {
    const camera = projectObsRoomCamera(ROOM);
    expect(camera.presence).toBe("standby");
    expect(camera.receiverReady).toBe(false);
  });

  test("does not advertise WHEP until the sibling path is ready", () => {
    const camera = projectObsRoomCamera({ ...ROOM, isLive: true, whepReady: false });
    expect(camera.playbackProtocol).toBe("hls");
    expect(camera.playbackUrl).toContain("/hls/obs/admin/index.m3u8");
    expect(camera.previewUrl).toBeNull();
  });

  test("prefers WHEP after MediaMTX confirms the sibling", () => {
    const camera = projectObsRoomCamera({ ...ROOM, isLive: true, whepReady: true });
    expect(camera.playbackProtocol).toBe("whep");
    expect(camera.playbackUrl).toContain("/webrtc/obs/admin-whep/whep");
    expect(camera.previewProtocol).toBe("whep");
    expect(camera.previewUrl).toContain("/webrtc/previews/obs-admin/whep");
  });
});
