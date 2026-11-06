import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { houseCastRosterKey, publishHouseCast, readHouseCast, resetHouseCastStore, subscribeHouseCastRoster, HOUSE_CAST_STALE_MS } from "./altDirector/houseCastStore";

// The alt director's cast mirrors the real house: the server broadcasts
// `house_cast` once a second, the director hook drops it into a plain store
// (never React state), and the house's render loop reads it per frame.

const read = (...parts: string[]) => readFileSync(join(import.meta.dir, ...parts), "utf8");
const joe = { id: "joe", kind: "human", x: 1, y: 2, heading: null, moving: false, room: "kitchen", seenAt: 1 };

afterEach(() => resetHouseCastStore());

describe("house cast wiring", () => {
  test("the store keeps the roster, notifies only on roster changes, and goes quiet when stale", () => {
    let calls = 0;
    subscribeHouseCastRoster(() => calls++);
    publishHouseCast({ updatedAt: 1, members: [joe] }, 1000);
    publishHouseCast({ updatedAt: 2, members: [{ ...joe, x: 1.5 }] }, 2000);
    expect(calls).toBe(1);
    expect(readHouseCast(2000)[0].x).toBe(1.5);
    expect(houseCastRosterKey(2000)).toBe("joe");
    expect(readHouseCast(2000 + HOUSE_CAST_STALE_MS + 1)).toEqual([]);
    publishHouseCast("garbage", 3000);
    expect(readHouseCast(3000)).toHaveLength(1);
  });

  test("server: the director process starts the cast tick and broadcasts it", () => {
    const engine = read("..", "server", "serverDirectorEngine.ts");
    expect(engine).toContain('startHouseCastTicking((cast) => realtimeBroadcast("house_cast", cast))');
    const worker = read("..", "server", "houseCastWorker.ts");
    // Mirrors off-air rooms too (the house chose public mirroring of every room).
    expect(worker).toContain("snapshot.offAirRooms");
    expect(worker).toContain("camera-fits.json");
  });

  test("client: the hook feeds the store, the house reads it per frame", () => {
    const hook = read("..", "director", "useServerDirector.ts");
    expect(hook).toContain('{ event: "house_cast" }, (payload) => publishHouseCast(payload.payload)');
    const house = read("components", "AltDirector3D.tsx");
    expect(house).toContain("new CastMirror(castGltf.scene, castGltf.animations, {");
    expect(house).toContain("skip: avatar?.rig ?? null,");
    // The mirrored people and pets sit where the house has seats.
    expect(house).toContain("seatFor: (x, z, room, kind, taken) =>");
    expect(house).toContain("mirror.update(dt, scratch.eye, animate);");
  });
});

describe("house cast opt-out wiring", () => {
  test("the worker filters untracked members and staff can toggle them", () => {
    const worker = read("..", "server", "houseCastWorker.ts");
    expect(worker).toContain("computeHouseCast({ readings, cameraRooms, fits, previous, now, untracked, lastSeen: seenStore.cache })");
    const route = read("..", "..", "..", "app", "api", "tank", "staff", "house-cast", "route.ts");
    expect(route).toContain("checkStaff()");
    const console = read("..", "director-configuration", "components", "DirectorWorkspace", "DirectorWorkspace.tsx");
    expect(console).toContain("<HouseCastPanel />");
  });
});

describe("no skit, anywhere", () => {
  test("no surface plays the rehearsal clips; room scenes mirror their own room only", () => {
    for (const file of [read("components", "AltDirector3D.tsx"), read("components", "RoomScene3D.tsx"), read("altDirector", "gamePreviews.ts")]) {
      expect(file).not.toContain("pickClips");
      expect(file).toContain("CastMirror");
    }
    expect(read("components", "RoomScene3D.tsx")).toContain("{ room: roomKey }");
    expect(read("altDirector", "gamePreviews.ts")).toContain("{ room: roomKey }");
  });
});

describe("pixel reskin wiring", () => {
  test("both 3D surfaces render through the pixel pass and play the house effects; previews use the pass", () => {
    for (const file of [read("components", "AltDirector3D.tsx"), read("components", "RoomScene3D.tsx")]) {
      expect(file).toContain("<PixelRenderer />");
      expect(file).toMatch(/[fF]x\.update\(/);
      expect(file).toMatch(/<primitive object=\{(fx|houseFx)\.group\} \/>/);
      expect(file).toContain('imageRendering: "pixelated"');
    }
    expect(read("altDirector", "gamePreviews.ts")).toContain("pass.render(renderer, room.scene, room.camera)");
    // The house's frame loop destructures \`fx\` from its walk basis: its effects must not be called fx.
    expect(read("components", "AltDirector3D.tsx")).toMatch(/houseFx\.update\(\s*dt,\s*walker && avatar \?/);
  });
});
