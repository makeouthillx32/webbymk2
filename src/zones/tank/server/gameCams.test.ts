import { describe, expect, test } from "bun:test";
import { gameCamKeysFromManifest, pickGameCam } from "./gameCams";

const keys = ["foyer", "game-room", "kitchen"];
const t0 = 1_000_000;

describe("game cams", () => {
  test("come from the published room scenes, in a stable tour order", () => {
    const manifest = {
      rooms: {
        kitchen: { file: "kitchen.glb", version: "b569032dae7c" },
        foyer: { file: "foyer.glb", version: "521213edf69b" },
        "evil": { file: "../house.glb", version: "521213edf69b" },
      },
      house: { file: "house.glb", version: "1e4b2d4df7a6" },
    };
    expect(gameCamKeysFromManifest(manifest)).toEqual(["foyer", "kitchen"]);
    expect(gameCamKeysFromManifest(null)).toEqual([]);
  });

  test("the tour starts on the first cam and holds it for the dwell", () => {
    const first = pickGameCam({ keys, current: null, switchedAt: t0, now: t0 });
    expect(first.roomKey).toBe("foyer");
    expect(first.reason).toContain("[GAME]");
    const held = pickGameCam({ keys, current: "foyer", switchedAt: t0, now: t0 + 5_000, dwellSeconds: 12 });
    expect(held.roomKey).toBe("foyer");
    expect(held.dwellSecondsRemaining).toBe(7);
  });

  test("then moves to the next room and wraps around", () => {
    expect(pickGameCam({ keys, current: "foyer", switchedAt: t0, now: t0 + 12_000, dwellSeconds: 12 }).roomKey).toBe("game-room");
    expect(pickGameCam({ keys, current: "kitchen", switchedAt: t0, now: t0 + 12_000, dwellSeconds: 12 }).roomKey).toBe("foyer");
  });

  test("a cam that left the manifest is dropped at once", () => {
    expect(pickGameCam({ keys, current: "attic", switchedAt: t0, now: t0 + 1_000 }).roomKey).toBe("foyer");
  });

  test("a staff take wins until it expires", () => {
    const hold = { roomKey: "kitchen", by: "Joe", until: t0 + 60_000 };
    const taken = pickGameCam({ keys, current: "foyer", switchedAt: t0, now: t0 + 1_000, hold });
    expect(taken.roomKey).toBe("kitchen");
    expect(taken.reason).toContain("Joe took the Kitchen game cam");
    expect(taken.dwellSecondsRemaining).toBe(59);
    expect(pickGameCam({ keys, current: "kitchen", switchedAt: t0, now: t0 + 61_000, hold, dwellSeconds: 12 }).roomKey).toBe("foyer");
    // A take on a room with no scene is ignored.
    expect(pickGameCam({ keys, current: "foyer", switchedAt: t0, now: t0 + 1_000, hold: { ...hold, roomKey: "attic" } }).roomKey).toBe("foyer");
  });

  test("no published scenes: nothing to cut to", () => {
    expect(pickGameCam({ keys: [], current: null, switchedAt: t0, now: t0 }).roomKey).toBeNull();
  });
});
