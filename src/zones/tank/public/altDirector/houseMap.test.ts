import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { canStand, floorAt, moveWithCollision, nearestHotspot, parseHouseMap, segmentHitsWall, type HouseMap } from "./houseMap";
import { pickShot, type ShotCamera } from "./cameraCuts";

// Two 4 m rooms side by side, a wall between them at x = 4 with a 1 m doorway
// (z 1.5..2.5), and a sofa in the right-hand room.
const RAW = {
  v: 1,
  radius: 0.2,
  blockerRadius: 0.1,
  spawn: [1, 2, 0],
  floors: [
    { label: "Foyer", room: "foyer", rect: [0, 0, 4, 4] },
    { label: "Kitchen", room: "kitchen", rect: [4, 0, 8, 4] },
  ],
  walls: [
    [3.98, 0, 4.02, 1.5],
    [3.98, 2.5, 4.02, 4],
  ],
  blockers: [[6, 0.5, 7, 1.5]],
  hotspots: [{ id: "fridge", label: "Fridge", blurb: "Respect the label.", at: [7.5, 1, 3.5], r: 1 }],
};

const map = parseHouseMap(JSON.stringify(RAW)) as HouseMap;

describe("alt director walk map", () => {
  test("parses the exported map (string or object) and rejects junk", () => {
    expect(map.floors.map((f) => f.room)).toEqual(["foyer", "kitchen"]);
    expect(map.walls).toHaveLength(2);
    expect(parseHouseMap(RAW)?.hotspots[0].id).toBe("fridge");
    expect(parseHouseMap(null)).toBeNull();
    expect(parseHouseMap("{not json")).toBeNull();
    expect(parseHouseMap({ floors: [] })).toBeNull();
    const odd = parseHouseMap({
      floors: [{ label: "x", room: "../etc", rect: [0, 0, 1, 1] }, { label: "inverted", rect: [2, 2, 1, 1] }],
      walls: [[0, 0, 1], "wall"],
      hotspots: [{ id: "a", label: "A", at: [0, 0], r: 1, blurb: "b" }],
    });
    expect(odd?.floors).toEqual([{ label: "x", room: null, rect: [0, 0, 1, 1] }]);
    expect(odd?.walls).toEqual([]);
    expect(odd?.hotspots).toEqual([]);
  });

  test("FX anchors, FX-on-use and tagged avatars come through; bad ids are dropped", () => {
    const parsed = parseHouseMap({
      ...RAW,
      hotspots: [
        { ...RAW.hotspots[0], fx: "pickups/coin-sparkle" },
        { id: "tv", label: "TV", blurb: "b", at: [1, 1, 1], r: 1, fx: "../../evil" },
      ],
      fx: [
        { id: "fx-fire-torch", effect: "fire/torch", at: [1, 0.5, 2], loop: true, size: 0.8, palette: "ice" },
        { effect: "fire/torch", at: [1, 0.5, 2], size: 99 },
        { effect: "<script>", at: [0, 0, 0] },
        { effect: "fire/torch", at: [0, 0] },
      ],
      avatars: [{ id: "joe", node: "Joe_Rig" }, { id: "Bad Id", node: "X" }],
    })!;
    expect(parsed.hotspots.map((h) => h.fx)).toEqual(["pickups/coin-sparkle", null]);
    expect(parsed.fx).toEqual([
      { id: "fx-fire-torch", effect: "fire/torch", at: [1, 0.5, 2], loop: true, size: 0.8, palette: "ice" },
      { id: "fire/torch", effect: "fire/torch", at: [1, 0.5, 2], loop: true, size: 6, palette: null },
    ]);
    expect(parsed.avatars).toEqual([{ id: "joe", node: "Joe_Rig" }]);
    // Maps exported before these existed still load.
    expect(map.fx).toEqual([]);
    expect(map.avatars).toEqual([]);
  });

  test("you can stand on a floor, not in a wall, not off the house", () => {
    expect(canStand(map, 1, 1)).toBe(true);
    expect(canStand(map, 3.9, 1)).toBe(false); // within body radius of the wall
    expect(canStand(map, 6.5, 1)).toBe(false); // on the sofa
    expect(canStand(map, -1, 1)).toBe(false); // outside
    expect(floorAt(map, 5, 2)?.label).toBe("Kitchen");
  });

  test("walls stop you and you slide along them instead of sticking", () => {
    const [x, z] = moveWithCollision(map, 3, 1, 2, 0.5);
    expect(x).toBeLessThan(3.8);
    expect(z).toBeCloseTo(1.5, 5);
  });

  test("a big step can't tunnel through a thin wall", () => {
    const [x] = moveWithCollision(map, 3.5, 0.8, 3, 0);
    expect(x).toBeLessThan(4);
  });

  test("corner correction: walking at the wall beside a doorway slips you into it", () => {
    // 15 cm off the doorway's edge (z 1.5..2.5, so the body fits z 1.7..2.3).
    let [x, z] = [3, 1.55];
    for (let i = 0; i < 80; i += 1) [x, z] = moveWithCollision(map, x, z, 0.04, 0);
    expect(x).toBeGreaterThan(4.3);
    // A plain wall far from any opening still just stops you.
    [x, z] = [3, 0.5];
    for (let i = 0; i < 80; i += 1) [x, z] = moveWithCollision(map, x, z, 0.04, 0);
    expect(x).toBeLessThan(3.8);
    expect(z).toBeCloseTo(0.5);
  });

  test("the doorway lets you through", () => {
    const [x, z] = moveWithCollision(map, 3, 2, 2, 0);
    expect(x).toBeCloseTo(5, 5);
    expect(z).toBe(2);
  });

  test("hotspots trigger within their reach only", () => {
    expect(nearestHotspot(map, 7.2, 3)?.id).toBe("fridge");
    expect(nearestHotspot(map, 5, 1)).toBeNull();
  });

  test("sight lines are blocked by walls, clear through the doorway", () => {
    expect(segmentHitsWall(map.walls, 2, 1, 6, 1)).toBe(true);
    expect(segmentHitsWall(map.walls, 2, 2, 6, 2)).toBe(false);
  });
});

function cam(key: string, from: [number, number, number], at: [number, number, number]): ShotCamera {
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 50);
  camera.position.set(...from);
  camera.lookAt(new THREE.Vector3(...at));
  camera.updateMatrixWorld();
  return { key, label: key, camera };
}

describe("alt director camera cuts", () => {
  const foyer = cam("foyer", [0.2, 2.1, 0.2], [2, 0.8, 2]);
  const kitchen = cam("kitchen", [7.8, 2.1, 3.8], [6, 0.8, 2]);
  const head = new THREE.Vector3();
  const feet = new THREE.Vector3();
  const at = (x: number, z: number) => {
    head.set(x, 1.35, z);
    feet.set(x, 0.1, z);
  };

  test("cuts to the camera of the room you're in", () => {
    at(2, 2);
    expect(pickShot([foyer, kitchen], null, head, feet, map, "foyer")).toBe("foyer");
    at(6, 2.5);
    expect(pickShot([foyer, kitchen], "foyer", head, feet, map, "kitchen")).toBe("kitchen");
  });

  test("a camera that can't see you (wall, or behind it) never takes the shot", () => {
    at(2, 3.5);
    // The kitchen camera is behind the wall from here.
    expect(pickShot([kitchen], null, head, feet, map, "foyer")).toBeNull();
  });

  test("the current camera holds while it still sees you in its room", () => {
    const foyer2 = cam("foyer-2", [3.8, 2.1, 3.8], [2, 0.8, 2]);
    at(2, 2);
    expect(pickShot([foyer, foyer2], "foyer-2", head, feet, map, "foyer")).toBe("foyer-2");
  });

  test("a high camera looking down still has you when your feet leave the frame", () => {
    // Close under the foyer camera: head and chest in shot, feet below it.
    const steep = cam("foyer", [0.2, 2.4, 0.2], [3.5, 0.9, 3.5]);
    at(1.1, 1.1);
    feet.set(1.1, 0.1, 1.1);
    expect(pickShot([steep], null, head, feet, map, "foyer")).toBe("foyer");
  });

  test("in a room whose camera can't see you, the follow cam beats another room's camera", () => {
    // Off to the side of the kitchen camera, which looks west along the
    // room; the foyer camera can see them through the doorway.
    const away = cam("kitchen", [7.8, 2.1, 0.2], [4.5, 0.8, 0.2]);
    const across = cam("foyer", [0.2, 2.1, 2], [6, 0.8, 2]);
    at(6.5, 2.6);
    expect(pickShot([away, across], null, head, feet, map, "kitchen")).toBeNull();
    // A hallway (no camera of its own) still takes any camera that sees you.
    expect(pickShot([away, across], null, head, feet, map, null)).toBe("foyer");
  });
});

describe("floor seams (walls decide the doors, not mesh cuts)", () => {
  // Two rooms whose floor meshes stop 7 cm apart, like the makeup room and
  // entry hall on 2026-11-04, with a wall along the seam except a 1 m door.
  const raw = {
    radius: 0.2,
    spawn: [3, 1, 0],
    floors: [
      { label: "Makeup room", room: "makeup-room", rect: [0, 0, 2, 3] },
      { label: "Entry hall", rect: [2.07, 0, 5, 3] },
    ],
    walls: [
      [1.98, 0, 2.09, 1],
      [1.98, 2, 2.09, 3],
    ],
  };

  test("a thin seam under a doorway is walkable", () => {
    const map = parseHouseMap(raw)!;
    expect(canStand(map, 2.035, 1.5)).toBe(true);
    let [x, z] = [3, 1.5];
    for (let i = 0; i < 60; i += 1) [x, z] = moveWithCollision(map, x, z, -0.05, 0);
    expect(x).toBeLessThan(1.5); // walked into the makeup room
  });

  test("a seam with a wall on it stays shut, and wide gaps are not bridged", () => {
    const sealed = parseHouseMap({ ...raw, walls: [[1.98, 0, 2.09, 3]] })!;
    let [x, z] = [3, 1.5];
    for (let i = 0; i < 60; i += 1) [x, z] = moveWithCollision(sealed, x, z, -0.05, 0);
    expect(x).toBeGreaterThan(2);
    const apart = parseHouseMap({ ...raw, floors: [raw.floors[0], { label: "Far", rect: [2.5, 0, 5, 3] }], walls: [] })!;
    expect(canStand(apart, 2.25, 1.5)).toBe(false);
  });
});
