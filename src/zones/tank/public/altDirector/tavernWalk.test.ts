import { describe, expect, test } from "bun:test";
import type { HouseMap } from "./houseMap";
import { clearLine, findPath, houseEntrance, pathLength, pointAlong } from "./tavernWalk";

// Two 4 m rooms side by side; the wall between them has a 0.8 m doorway at z 1.6..2.4.
const map: HouseMap = {
  radius: 0.2,
  blockerRadius: 0.15,
  spawn: [1, 0, 1],
  floors: [
    { label: "A", room: "a", rect: [0, 0, 4, 4] },
    { label: "B", room: "b", rect: [4, 0, 8, 4] },
  ],
  walls: [
    [3.95, 0, 4.05, 1.6],
    [3.95, 2.4, 4.05, 4],
  ],
  blockers: [[6, 0.5, 7, 1.5]],
  hotspots: [{ id: "front-door", label: "Front door", blurb: "", effect: null, at: [0.05, 1, 3.95], r: 1, node: null, fx: null, room: "a" }],
  seats: [],
  fx: [],
  avatars: [],
};

describe("findPath", () => {
  test("goes through the doorway, every leg walkable", () => {
    const path = findPath(map, [1, 0.6], [7, 0.4])!;
    expect(path).not.toBeNull();
    for (let i = 1; i < path.length; i += 1) expect(clearLine(map, path[i - 1], path[i])).toBe(true);
    // It must pass the wall's line inside the doorway.
    const crossing = path.findIndex((p, i) => i > 0 && path[i - 1][0] < 4 && p[0] >= 4);
    expect(crossing).toBeGreaterThan(0);
    // A few straight legs, not a staircase of grid cells.
    expect(path.length).toBeLessThan(7);
    expect(pathLength(path)).toBeLessThan(10);
  });

  test("a clear line is one leg", () => {
    expect(findPath(map, [0.5, 0.5], [3, 3])).toEqual([[0.5, 0.5], [3, 3]]);
  });

  test("ends exactly on a place you can't quite stand on (tucked against furniture)", () => {
    const path = findPath(map, [1, 1], [6.05, 1])!;
    expect(path[path.length - 1]).toEqual([6.05, 1]);
  });

  test("no way through is null", () => {
    const shut: HouseMap = { ...map, walls: [[3.95, 0, 4.05, 4]] };
    expect(findPath(shut, [1, 1], [6, 3])).toBeNull();
  });
});

test("pointAlong walks the legs", () => {
  const path: [number, number][] = [[0, 0], [2, 0], [2, 2]];
  expect(pointAlong(path, 1)).toEqual([1, 0]);
  expect(pointAlong(path, 3)).toEqual([2, 1]);
  expect(pointAlong(path, 99)).toEqual([2, 2]);
});

test("they come in at the front door", () => {
  const [x, z] = houseEntrance(map);
  expect(Math.hypot(x - 0.05, z - 3.95)).toBeLessThan(0.4);
  expect(houseEntrance({ ...map, hotspots: [] })).toEqual([1, 1]);
});
