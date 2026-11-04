import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCameraFits, imageToFloor } from "./fisheyeFloor";
import { cameraRoomMap, castIdForName, castLabel, computeHouseCast, houseCastChanged, parseHouseCast, type CastMember } from "./houseCast";

const fixture = (room: string) => JSON.parse(readFileSync(join(import.meta.dir, "__fixtures__", `${room}.result.json`), "utf8"));
const fits = parseCameraFits({ rooms: { kitchen: fixture("kitchen"), "living-room": fixture("living-room") } });
const cameraRooms = new Map([
  ["cam-k", "kitchen"],
  ["cam-l", "living-room"],
  ["cam-x", "basement"], // no fit: ignored
]);
const box = (over: Partial<{ nx: number; ny: number; nw: number; nh: number; label: string; confidence: number; targetName: string }>) => ({
  nx: 0.45,
  ny: 0.5,
  nw: 0.1,
  nh: 0.4,
  label: "person",
  confidence: 0.9,
  ...over,
});

describe("house cast: real boxes -> where the cast stands", () => {
  test("a named person lands at their feet on the house floor", () => {
    const members = computeHouseCast({
      readings: [{ cameraId: "cam-k", boundingBoxes: [box({ targetName: "Malia" })] }],
      cameraRooms,
      fits,
      previous: [],
      now: 1000,
    });
    expect(members).toHaveLength(1);
    const feet = imageToFloor(fits.kitchen, { x: 0.5, y: 0.9 })!;
    expect(members[0]).toMatchObject({ id: "malia", kind: "human", room: "kitchen", moving: false });
    expect(members[0].x).toBeCloseTo(feet.x, 2);
    expect(members[0].y).toBeCloseTo(feet.y, 2);
  });

  test("unnamed people, unknown rooms and weak boxes drive nothing", () => {
    const members = computeHouseCast({
      readings: [
        { cameraId: "cam-k", boundingBoxes: [box({}), box({ targetName: "joe", confidence: 0.1 })] },
        { cameraId: "cam-x", boundingBoxes: [box({ targetName: "tyler" })] },
        { cameraId: "cam-unknown", boundingBoxes: [box({ targetName: "tyler" })] },
      ],
      cameraRooms,
      fits,
      previous: [],
      now: 1000,
    });
    expect(members).toEqual([]);
  });

  test("walking is detected, smoothed, and held briefly once out of sight", () => {
    const first = computeHouseCast({ readings: [{ cameraId: "cam-l", boundingBoxes: [box({ targetName: "tyler", nx: 0.3 })] }], cameraRooms, fits, previous: [], now: 0 });
    const second = computeHouseCast({ readings: [{ cameraId: "cam-l", boundingBoxes: [box({ targetName: "tyler", nx: 0.5 })] }], cameraRooms, fits, previous: first, now: 1000 });
    expect(second[0].moving).toBe(true);
    expect(second[0].heading).not.toBeNull();
    const target = imageToFloor(fits["living-room"], { x: 0.55, y: 0.9 })!;
    // Pulled most of the way there, not snapped.
    expect(Math.hypot(second[0].x - target.x, second[0].y - target.y)).toBeGreaterThan(0.01);
    const gone = computeHouseCast({ readings: [], cameraRooms, fits, previous: second, now: 3000 });
    expect(gone).toHaveLength(1);
    expect(gone[0].moving).toBe(false);
    expect(computeHouseCast({ readings: [], cameraRooms, fits, previous: second, now: 9000 })).toEqual([]);
  });

  test("animals take slots, keep them by proximity, and one cat on two cameras is one cat", () => {
    const one = computeHouseCast({
      readings: [{ cameraId: "cam-k", boundingBoxes: [box({ label: "dog", nx: 0.2, ny: 0.6, nh: 0.2 }), box({ label: "dog", nx: 0.7, ny: 0.6, nh: 0.2 })] }],
      cameraRooms,
      fits,
      previous: [],
      now: 0,
    });
    expect(one.map((m) => m.id)).toEqual(["brindle-dog", "golden-dog"]);
    // Next tick the boxes arrive in the other order: identities must not swap.
    const two = computeHouseCast({
      readings: [{ cameraId: "cam-k", boundingBoxes: [box({ label: "dog", nx: 0.71, ny: 0.6, nh: 0.2 }), box({ label: "dog", nx: 0.21, ny: 0.6, nh: 0.2 })] }],
      cameraRooms,
      fits,
      previous: one,
      now: 1000,
    });
    for (const id of ["golden-dog", "brindle-dog"]) {
      const a = one.find((m) => m.id === id)!;
      const b = two.find((m) => m.id === id)!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.3);
    }
    const kitchenCat = imageToFloor(fits.kitchen, { x: 0.5, y: 0.8 })!;
    const sameSpot: CastMember[] = computeHouseCast({
      readings: [
        { cameraId: "cam-k", boundingBoxes: [box({ label: "cat", nx: 0.45, ny: 0.7, nh: 0.1 })] },
        { cameraId: "cam-k", boundingBoxes: [box({ label: "cat", nx: 0.46, ny: 0.7, nh: 0.1 })] },
      ],
      cameraRooms,
      fits,
      previous: [],
      now: 0,
    });
    expect(sameSpot).toHaveLength(1);
    expect(sameSpot[0].x).toBeCloseTo(kitchenCat.x, 0);
  });

  test("names, room maps, change detection and wire parsing", () => {
    expect(castIdForName(" Olly ")).toBe("oly");
    expect(castIdForName("@Joe")).toBe("joe");
    expect(castIdForName("golden-dog")).toBeNull(); // animals are never named people
    expect(castIdForName("stranger")).toBeNull();
    const map = cameraRoomMap([{ roomKey: "kitchen", cameraIds: ["a"] }], [{ id: "a", roomScope: "x" }, { id: "b", roomScope: "foyer" }]);
    expect(map.get("a")).toBe("kitchen");
    expect(map.get("b")).toBe("foyer");
    const m: CastMember = { id: "joe", kind: "human", x: 1, y: 1, heading: null, moving: false, room: "kitchen", seenAt: 0 };
    expect(houseCastChanged([m], [{ ...m, x: 1.01 }])).toBe(false);
    expect(houseCastChanged([m], [{ ...m, x: 1.2 }])).toBe(true);
    expect(houseCastChanged([m], [])).toBe(true);
    expect(parseHouseCast({ updatedAt: 5, members: [m, { id: "nobody", x: 0, y: 0 }, { id: "malia", x: "1", y: 0 }] })).toEqual({ updatedAt: 5, members: [m] });
    expect(parseHouseCast("nope")).toBeNull();
  });
});

describe("house cast opt-out", () => {
  test("an untracked member is never placed or held; its pet slot is skipped", () => {
    const readings = [{ cameraId: "cam-k", boundingBoxes: [box({ targetName: "tyler" }), box({ targetName: "malia", nx: 0.2 }), box({ label: "dog", nx: 0.7, ny: 0.6, nh: 0.2 })] }];
    const all = computeHouseCast({ readings, cameraRooms, fits, previous: [], now: 0 });
    expect(all.map((m) => m.id)).toEqual(["golden-dog", "malia", "tyler"]);
    const untracked = new Set(["tyler", "golden-dog"]);
    const some = computeHouseCast({ readings, cameraRooms, fits, previous: all, now: 1000, untracked });
    // Tyler is gone at once (not held for the TTL); the dog takes the next slot.
    expect(some.map((m) => m.id)).toEqual(["brindle-dog", "malia"]);
    expect(castLabel("golden-dog")).toBe("Golden dog");
  });
});
