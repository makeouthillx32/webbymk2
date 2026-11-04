// Draw calls, not megabytes, are what limits how much house fits on a phone:
// the shell has ~660 separate meshes but only ~16 materials. At load, every
// static mesh that shares a material (and a wall layer) is merged into one, so
// adding furniture in Blender costs almost nothing per frame.
//
// Never merged: skinned meshes and anything inside a rig (the cast, when an
// older single-file house carries it), anything a clip moves (itself or a
// parent), meshes with morph targets or several materials, and whatever `keep`
// names (a mesh the page changes on its own, like the TV screen).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Inside a rig (under a bone or an armature node) or moved by a clip itself. */
function moves(object: THREE.Object3D, root: THREE.Object3D, animated: Set<string>): boolean {
  for (let o: THREE.Object3D | null = object; o && o !== root; o = o.parent) {
    if (animated.has(o.name) || (o as THREE.Bone).isBone) return true;
    if (o !== object && o.children.some((c) => (c as THREE.Bone).isBone)) return true;
  }
  return false;
}

/** Node names any of these clips animate (track "Node.property" → "Node"). */
export function animatedNodeNames(clips: readonly THREE.AnimationClip[]): Set<string> {
  const names = new Set<string>();
  for (const clip of clips) {
    for (const track of clip.tracks) names.add(THREE.PropertyBinding.parseTrackName(track.name).nodeName);
  }
  return names;
}

function signature(geometry: THREE.BufferGeometry): string {
  const attributes = Object.keys(geometry.attributes)
    .sort()
    .map((name) => {
      const a = geometry.attributes[name] as THREE.BufferAttribute;
      return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
    });
  return `${attributes.join(",")}|${geometry.index ? "i" : "n"}`;
}

export function mergeStaticMeshes(
  root: THREE.Object3D,
  keep: (mesh: THREE.Mesh) => boolean = () => false,
  clips: readonly THREE.AnimationClip[] = [],
): { before: number; after: number } {
  const animated = animatedNodeNames(clips);
  if (root.userData.tankMerged) return root.userData.tankMerged as { before: number; after: number };
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const groups = new Map<string, { material: THREE.Material; layer: unknown; meshes: THREE.Mesh[] }>();
  let before = 0;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    before += 1;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(mesh.material)) return;
    if (Object.keys(mesh.geometry.morphAttributes).length || moves(mesh, root, animated) || keep(mesh)) return;
    const layer = mesh.userData?.tank_layer ?? null;
    const key = `${mesh.material.uuid}|${layer}|${signature(mesh.geometry)}`;
    const group = groups.get(key) ?? { material: mesh.material, layer, meshes: [] };
    group.meshes.push(mesh);
    groups.set(key, group);
  });

  let removed = 0;
  let added = 0;
  const matrix = new THREE.Matrix4();
  for (const { material, layer, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => mesh.geometry.clone().applyMatrix4(matrix.multiplyMatrices(toRoot, mesh.matrixWorld)));
    const merged = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `merged ${material.name || "material"}`;
    if (layer) mesh.userData.tank_layer = layer;
    root.add(mesh);
    for (const original of meshes) {
      original.removeFromParent();
      original.geometry.dispose();
    }
    removed += meshes.length;
    added += 1;
  }
  const result = { before, after: before - removed + added };
  root.userData.tankMerged = result;
  return result;
}
