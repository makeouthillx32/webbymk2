import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRoomSceneManifest, roomSceneUrl, shouldShowRoomScene } from "./roomScenes";

// Source files on this Windows host are CRLF; normalise before matching.
const readSource = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("Tank off-air 3D room scenes", () => {
  test("only well-formed rooms that point at their own fixed file are kept", () => {
    const manifest = parseRoomSceneManifest({
      rooms: {
        kitchen: { file: "kitchen.glb", version: "a1b2c3d4e5f6", bytes: 779568 },
        foyer: { file: "../secret.glb", version: "a1b2c3d4e5f6" },
        "Game Room": { file: "Game Room.glb", version: "a1b2c3d4e5f6" },
        "makeup-room": { file: "makeup-room.glb", version: "not-a-hash" },
      },
    });
    expect(Object.keys(manifest.rooms)).toEqual(["kitchen"]);
    expect(manifest.rooms.kitchen).toEqual({ file: "kitchen.glb", version: "a1b2c3d4e5f6" });
  });

  test("a missing or broken manifest means no room has a scene", () => {
    expect(parseRoomSceneManifest(null).rooms).toEqual({});
    expect(parseRoomSceneManifest("nope").rooms).toEqual({});
    expect(parseRoomSceneManifest({ rooms: [] }).rooms).toEqual({});
  });

  test("scene URLs are versioned so a re-export replaces the cached file", () => {
    const manifest = parseRoomSceneManifest({ rooms: { kitchen: { file: "kitchen.glb", version: "a1b2c3d4e5f6" } } });
    const url = roomSceneUrl(manifest, "kitchen");
    expect(url).toEndWith("/storage/v1/object/public/tank-assets/rooms3d/kitchen.glb?v=a1b2c3d4e5f6");
    expect(roomSceneUrl(manifest, "foyer")).toBeNull();
    expect(roomSceneUrl(null, "kitchen")).toBeNull();
  });

  test("the 3D room stands in only for a dark single-room view", () => {
    const base = { mode: "room", heroHasRealFeed: false, sceneUrl: "x.glb?v=1", webglAvailable: true };
    expect(shouldShowRoomScene(base)).toBe(true);
    expect(shouldShowRoomScene({ ...base, heroHasRealFeed: true })).toBe(false);
    expect(shouldShowRoomScene({ ...base, mode: "director" })).toBe(false);
    expect(shouldShowRoomScene({ ...base, mode: "grid" })).toBe(false);
    expect(shouldShowRoomScene({ ...base, sceneUrl: null })).toBe(false);
    expect(shouldShowRoomScene({ ...base, webglAvailable: false })).toBe(false);
  });

  test("three.js is lazy-loaded and a failed scene falls back to the off-air card", () => {
    const experience = readSource(join(import.meta.dir, "TankExperience.tsx"));
    expect(experience).toContain('const RoomScene3D = dynamic(() => import("./components/RoomScene3D"), {\n  ssr: false,');
    expect(experience).not.toMatch(/^import .* from "\.\/components\/RoomScene3D";$/m);
    expect(experience).toContain("onFailed={() => setFailedRoomSceneUrl(roomSceneSrc)}");
    expect(experience).toContain("failedRoomSceneUrl !== roomSceneSrc");
    // Switched-off rooms with a scene stay in the room list (WebGL permitting).
    expect(experience).toContain("buildBrowseRooms(fixtureRooms, snapshot, sceneRoomKeys)");
    expect(experience).toContain("webglAvailable && roomSceneManifest ? Object.keys(roomSceneManifest.rooms) : []");

    const scene = readSource(join(import.meta.dir, "components", "RoomScene3D.tsx"));
    expect(scene).toContain('frameloop={visible ? "always" : "never"}');
    expect(scene).toContain("roomSceneDecoderPath()");
    expect(scene).not.toContain("gstatic");
  });
});
