import { afterEach, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { CastMirror } from "./castMirror";
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
});
