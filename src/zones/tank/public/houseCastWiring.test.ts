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
    expect(house).toContain("const cast = readHouseCast();");
    expect(house).toContain("if (mirrorLive) castRigs.forEach((rig) => rig.ownClips.forEach((name) => benched.add(name)));");
    expect(house).toContain("if (!rig || rig === avatar?.rig) continue;");
  });
});
