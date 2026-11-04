import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { animatedNodeNames, mergeStaticMeshes } from "./mergeStatic";

const wood = new THREE.MeshBasicMaterial({ name: "wood" });
const paint = new THREE.MeshBasicMaterial({ name: "paint" });

function box(name: string, material: THREE.Material, x: number, layer?: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.name = name;
  mesh.position.set(x, 0, 0);
  if (layer) mesh.userData.tank_layer = layer;
  return mesh;
}

const meshes = (root: THREE.Object3D) => {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => (o as THREE.Mesh).isMesh && list.push(o as THREE.Mesh));
  return list;
};

describe("merging the house shell's static meshes", () => {
  test("meshes sharing a material collapse into one, in the same place", () => {
    const root = new THREE.Group();
    const shelf = new THREE.Group();
    shelf.position.set(0, 2, 0);
    shelf.add(box("plank", wood, 5));
    root.add(box("table", wood, 0), box("chair", wood, 3), box("wall", paint, 0), shelf);

    expect(mergeStaticMeshes(root)).toEqual({ before: 4, after: 2 });
    const left = meshes(root);
    expect(left.map((m) => m.material)).toEqual([paint, wood]);
    const merged = left.find((m) => m.material === wood)!;
    merged.geometry.computeBoundingBox();
    // table at x=0 to the plank at x=5, y lifted by its parent group.
    expect(merged.geometry.boundingBox!.min.x).toBeCloseTo(-0.5);
    expect(merged.geometry.boundingBox!.max.x).toBeCloseTo(5.5);
    expect(merged.geometry.boundingBox!.max.y).toBeCloseTo(2.5);
  });

  test("wall layers stay separate so upper walls can still be hidden", () => {
    const root = new THREE.Group();
    root.add(box("a", paint, 0), box("b", paint, 1), box("c", paint, 2, "upper"), box("d", paint, 3, "upper"));
    mergeStaticMeshes(root);
    const layers = meshes(root).map((m) => m.userData.tank_layer ?? null).sort();
    expect(layers).toEqual([null, "upper"]);
  });

  test("the cast, animated nodes and kept meshes are left alone", () => {
    const root = new THREE.Group();
    const rig = new THREE.Group();
    rig.name = "Joe_Rig";
    const bone = new THREE.Bone();
    bone.name = "root";
    rig.add(bone, box("sprite card", wood, 0));
    bone.add(box("hat", wood, 0));
    const fan = new THREE.Group();
    fan.name = "Ceiling fan";
    fan.add(box("blade", wood, 0));
    root.add(rig, fan, box("tv", wood, 0), box("table", wood, 0), box("chair", wood, 1));
    root.add(box("PX_TV_Screen", wood, 0));

    const spin = new THREE.AnimationClip("spin", 1, [
      new THREE.QuaternionKeyframeTrack("Ceiling fan.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const result = mergeStaticMeshes(root, (m) => m.name === "PX_TV_Screen", [spin]);
    const names = meshes(root).map((m) => m.name).sort();
    // tv + table + chair merge; the rig's card and hat, the fan blade and the screen stay.
    expect(names).toEqual(["PX_TV_Screen", "blade", "hat", "merged wood", "sprite card"]);
    expect(result).toEqual({ before: 7, after: 5 });
  });

  test("a second call is a no-op (cached on the scene)", () => {
    const root = new THREE.Group();
    root.add(box("a", wood, 0), box("b", wood, 1));
    const first = mergeStaticMeshes(root);
    root.add(box("c", wood, 2), box("d", wood, 3));
    expect(mergeStaticMeshes(root)).toBe(first);
    expect(meshes(root)).toHaveLength(3);
  });

  test("clip tracks name the nodes they move", () => {
    const clip = new THREE.AnimationClip("x", 1, [
      new THREE.VectorKeyframeTrack("Door.position", [0], [0, 0, 0]),
      new THREE.NumberKeyframeTrack("Lamp.material.opacity", [0], [1]),
    ]);
    expect([...animatedNodeNames([clip])].sort()).toEqual(["Door", "Lamp"]);
  });
});
