import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  castSceneUrl,
  directorViewToggle,
  houseSceneUrl,
  parseRoomSceneManifest,
  roomSceneUrl,
  shouldShowAltDirector,
  shouldShowRoomScene,
} from "./roomScenes";

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

  test("the walkable house is read only from its own fixed file", () => {
    const ok = parseRoomSceneManifest({ rooms: {}, house: { file: "house.glb", version: "efd723b038d2", bytes: 2508912 } });
    expect(ok.house).toEqual({ file: "house.glb", version: "efd723b038d2" });
    expect(houseSceneUrl(ok)).toEndWith("/storage/v1/object/public/tank-assets/rooms3d/house.glb?v=efd723b038d2");
    expect(parseRoomSceneManifest({ rooms: {}, house: { file: "../x.glb", version: "efd723b038d2" } }).house).toBeNull();
    expect(parseRoomSceneManifest({ rooms: {}, house: { file: "house.glb", version: "nope" } }).house).toBeNull();
    expect(parseRoomSceneManifest({ rooms: {} }).house).toBeNull();
    expect(houseSceneUrl(null)).toBeNull();
  });

  test("the cast is its own fixed file and only counts next to a house", () => {
    const both = parseRoomSceneManifest({
      rooms: {},
      house: { file: "house.glb", version: "1e4b2d4df7a6" },
      cast: { file: "cast.glb", version: "220d53127454", rigs: ["Joe"] },
    });
    expect(both.cast).toEqual({ file: "cast.glb", version: "220d53127454" });
    expect(castSceneUrl(both)).toEndWith("/storage/v1/object/public/tank-assets/rooms3d/cast.glb?v=220d53127454");
    // A cast without a house shows nothing; a house without a cast carries its own rigs.
    expect(castSceneUrl({ ...both, house: null })).toBeNull();
    expect(castSceneUrl({ ...both, cast: null })).toBeNull();
    expect(houseSceneUrl({ ...both, cast: null })).not.toBeNull();
    expect(parseRoomSceneManifest({ rooms: {}, cast: { file: "house.glb", version: "220d53127454" } }).cast).toBeNull();
    expect(parseRoomSceneManifest({ rooms: {}, cast: { file: "cast.glb", version: "x" } }).cast).toBeNull();
    expect(castSceneUrl(null)).toBeNull();
  });

  test("the alt director loads the cast next to the shell and merges the shell's static meshes", () => {
    const experience = readSource(join(import.meta.dir, "TankExperience.tsx"));
    expect(experience).toContain("castUrl={castSceneUrl(roomSceneManifest)}");
    const walker = readSource(join(import.meta.dir, "components", "AltDirector3D.tsx"));
    expect(walker).toContain("useGLTF(castUrl ?? url");
    expect(walker).toMatch(/mergeStaticMeshes\(\s*gltf\.scene,[\s\S]{0,160}gltf\.animations,\s*\)/);
  });

  test("the alt director takes the Director only while the whole house is dark", () => {
    const base = { mode: "director", directorHasNoRooms: true, houseUrl: "house.glb?v=1", webglAvailable: true };
    expect(shouldShowAltDirector(base)).toBe(true);
    expect(shouldShowAltDirector({ ...base, directorHasNoRooms: false })).toBe(false);
    expect(shouldShowAltDirector({ ...base, mode: "room" })).toBe(false);
    expect(shouldShowAltDirector({ ...base, mode: "grid" })).toBe(false);
    expect(shouldShowAltDirector({ ...base, houseUrl: null })).toBe(false);
    expect(shouldShowAltDirector({ ...base, webglAvailable: false })).toBe(false);
  });

  test("a viewer can pick game mode while rooms are on air, and only then can pick IRL", () => {
    const live = { mode: "director", directorHasNoRooms: false, houseUrl: "house.glb?v=1", webglAvailable: true };
    expect(shouldShowAltDirector({ ...live, viewerPrefersGame: true })).toBe(true);
    expect(shouldShowAltDirector({ ...live, viewerPrefersGame: false })).toBe(false);
    // A stale "irl" choice can't keep a dark house on an empty programme.
    expect(shouldShowAltDirector({ ...live, directorHasNoRooms: true, viewerPrefersGame: false })).toBe(true);
    // Game mode is a Director view only.
    expect(shouldShowAltDirector({ ...live, mode: "room", viewerPrefersGame: true })).toBe(false);

    expect(directorViewToggle(live)).toEqual({ visible: true, irlAvailable: true });
    expect(directorViewToggle({ ...live, directorHasNoRooms: true })).toEqual({ visible: true, irlAvailable: false });
    expect(directorViewToggle({ ...live, houseUrl: null })).toEqual({ visible: false, irlAvailable: false });
    expect(directorViewToggle({ ...live, mode: "grid" }).visible).toBe(false);
  });

  test("picking game mode stops the live programme instead of streaming it under the house", () => {
    const experience = readSource(join(import.meta.dir, "TankExperience.tsx"));
    expect(experience).toContain("viewerPrefersGame: directorView === \"game\"");
    expect(experience).toMatch(/heroHasRealFeed && !showAltDirector && \(\s*<CameraPlayer/);
  });

  test("the alt director is lazy-loaded, replaces the off-air card, and falls back to it", () => {
    const experience = readSource(join(import.meta.dir, "TankExperience.tsx"));
    expect(experience).toContain('const AltDirector3D = dynamic(() => import("./components/AltDirector3D"), {\n  ssr: false,');
    expect(experience).not.toMatch(/^import .* from "\.\/components\/AltDirector3D";$/m);
    expect(experience).toContain("onFailed={() => setAltDirectorFailedUrl(houseSceneSrc)}");
    expect(experience).toContain("altDirectorFailedUrl !== houseSceneSrc");
    expect(experience).toContain("{!showAltDirector && (");

    const walker = readSource(join(import.meta.dir, "components", "AltDirector3D.tsx"));
    expect(walker).toContain('frameloop={visible ? "always" : "never"}');
    expect(walker).toContain("roomSceneDecoderPath()");
    // Movement keys must not reach the page's D (dock) / I (inventory) shortcuts.
    expect(walker).toContain("e.stopPropagation();\n          input.current.keys.add(e.code);");
    expect(walker).not.toContain("gstatic");
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
