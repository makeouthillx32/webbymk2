import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CastMirror, SIT_AFTER_MS } from "./castMirror";
import type { HouseSeat } from "./houseMap";
import { publishHouseCast, resetHouseCastStore } from "./houseCastStore";

const rig = (name: string, x: number, z: number) => {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, 0.025, z);
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()));
  return g;
};
const scene = () => {
  const root = new THREE.Group();
  root.add(rig("Joe_Rig", 3.4, 0.6), rig("Malia_Rig", 2.55, -0.18), rig("GoldenDog_Rig", -0.55, -0.6));
  return root;
};
const member = (id: string, x: number, y: number, room = "kitchen") => ({ id, kind: "human", x, y, heading: null, moving: false, room, seenAt: 1 });
const eye = new THREE.Vector3(0, 2, 5);

afterEach(() => resetHouseCastStore());

describe("cast mirror", () => {
  test("a member who stays still by a free seat sits after a moment; a pet gets up on it; moving stands them", () => {
    const root = scene();
    // A chair in the kitchen at three (-8, 0.45, 1.7): seat top 0.45 m.
    const chair: HouseSeat = { id: "chair-1", label: "Chair", at: [-8, 0.45, 1.7], yaw: 0, room: "kitchen" };
    const seatFor = (x: number, z: number, room: string, _kind: string, taken: ReadonlySet<string>) =>
      room === "kitchen" && !taken.has(chair.id) && Math.hypot(x - chair.at[0], z - chair.at[2]) < 0.75 ? chair : null;
    const mirror = new CastMirror(root, [], { seatFor });
    const malia = root.getObjectByName("Malia_Rig")!;
    const dog = root.getObjectByName("GoldenDog_Rig")!;
    // Her feet are reported half a metre in front of the chair (house y -> three -z).
    publishHouseCast({ updatedAt: 1, members: [member("malia", -8, -2.2)] });
    mirror.update(0.016, eye, true, 1000);
    expect(mirror.members[0].seated).toBe(false);
    mirror.update(0.016, eye, true, 1000 + SIT_AFTER_MS);
    expect(mirror.members[0].seated).toBe(true);
    for (let i = 0; i < 120; i += 1) mirror.update(0.05, eye, true, 1000 + SIT_AFTER_MS + i * 50);
    // Settled onto the seat itself; a flat card sinks so the cushion hides its legs.
    expect(malia.position.x).toBeCloseTo(-8, 2);
    expect(malia.position.z).toBeCloseTo(1.7, 2);
    expect(malia.position.y).toBeCloseTo(0.025 + 0.45 - 0.82, 2);
    // The chair is hers now: the dog beside it stays on the floor.
    publishHouseCast({ updatedAt: 2, members: [member("malia", -8, -2.2), { ...member("golden-dog", -8, -1.9), kind: "dog" }] });
    for (let i = 0; i < 80; i += 1) mirror.update(0.05, eye, true, 20_000 + i * 50);
    expect(mirror.members.find((m) => m.id === "golden-dog")!.seated).toBe(false);
    // She walks off: she stands, and the dog can take the chair, up on the seat.
    publishHouseCast({ updatedAt: 3, members: [{ ...member("malia", -6, 0), moving: true }, { ...member("golden-dog", -8, -1.9), kind: "dog" }] });
    for (let i = 0; i < 100; i += 1) mirror.update(0.05, eye, true, 30_000 + i * 50);
    expect(mirror.members.find((m) => m.id === "malia")!.seated).toBe(false);
    expect(mirror.members.find((m) => m.id === "golden-dog")!.seated).toBe(true);
    expect(dog.position.y).toBeCloseTo(0.025 + 0.45, 2);
  });

  test("nobody detected: every sprite hidden, nothing rehearsing", () => {
    const root = scene();
    const mirror = new CastMirror(root, []);
    mirror.update(0.016, eye);
    expect(root.children.every((c) => !c.visible)).toBe(true);
    expect(mirror.shown).toBe("");
  });

  test("a detected member appears where they stand (house y -> three -z), the rest stay hidden", () => {
    const root = scene();
    const mirror = new CastMirror(root, []);
    publishHouseCast({ updatedAt: 1, members: [member("malia", -8, -1.7)] });
    mirror.update(0.016, eye);
    const malia = root.getObjectByName("Malia_Rig")!;
    expect(malia.visible).toBe(true);
    expect(malia.position.x).toBeCloseTo(-8, 5);
    expect(malia.position.z).toBeCloseTo(1.7, 5);
    expect(root.getObjectByName("Joe_Rig")!.visible).toBe(false);
    expect(mirror.shown).toBe("malia");
    // Leaves the cameras: hidden again.
    publishHouseCast({ updatedAt: 2, members: [] });
    mirror.update(0.016, eye);
    expect(malia.visible).toBe(false);
  });

  test("a room scene only shows members seen in that room; the visitor's rig is skipped", () => {
    const root = scene();
    publishHouseCast({ updatedAt: 1, members: [member("joe", 1, 1, "living-room"), member("malia", 2, 2, "kitchen")] });
    const kitchen = new CastMirror(root, [], { room: "kitchen", skip: root.getObjectByName("Joe_Rig") });
    kitchen.update(0.016, eye);
    expect(kitchen.shown).toBe("malia");
    kitchen.dispose();
    expect(root.getObjectByName("Malia_Rig")!.position.x).toBeCloseTo(2.55, 5); // back on its mark
  });
  test("walk-only avatars wait hidden, except the one the visitor wears", () => {
    const root = scene();
    const rocker = rig("Rocker_Rig", -2, 8);
    rocker.userData.tank_avatar = "rocker";
    const monk = rig("Monk_Rig", 0, 8);
    monk.userData.tank_avatar = "monk";
    root.add(rocker, monk);
    const mirror = new CastMirror(root, [], { skip: monk });
    mirror.update(0.016, eye);
    expect(rocker.visible).toBe(false);
    expect(monk.visible).toBe(true);
  });
});
