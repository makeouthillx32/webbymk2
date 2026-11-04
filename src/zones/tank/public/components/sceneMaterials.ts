// Shared by the off-air room scenes and the alt director's walkable house.
import * as THREE from "three";

// Blender's pixel look is emission-only and unlit. glTF carries it as an
// emissive texture on a lit material; rebuild it as unlit. Only the cast's
// sprites are cut-outs — the house textures carry alpha Blender ignores, and
// cutting them would punch holes in the walls.
export function toUnlit(material: THREE.Material, cutout: boolean): THREE.Material {
  const m = material as THREE.MeshStandardMaterial;
  const map = m.emissiveMap ?? m.map ?? null;
  const emissive = m.emissive && m.emissive.getHex() !== 0 ? m.emissive.clone() : null;
  const color = emissive ?? (map ? new THREE.Color(1, 1, 1) : (m.color?.clone() ?? new THREE.Color(1, 1, 1)));
  const basic = new THREE.MeshBasicMaterial({ map, color, side: m.side, alphaTest: cutout ? 0.5 : 0 });
  basic.name = m.name;
  return basic;
}

/**
 * Convert every material once per loaded scene. Converted materials are
 * shared per source material, so a 700-mesh house compiles a few dozen
 * shaders rather than one per mesh.
 */
export function prepareScene(root: THREE.Object3D) {
  if (root.userData.tankPrepared) return;
  const cache = new Map<string, THREE.Material>();
  const convert = (material: THREE.Material, cutout: boolean) => {
    const key = `${material.uuid}:${cutout ? 1 : 0}`;
    let unlit = cache.get(key);
    if (!unlit) {
      unlit = toUnlit(material, cutout);
      cache.set(key, unlit);
    }
    return unlit;
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const cutout = (mesh as THREE.SkinnedMesh).isSkinnedMesh || /sprite/i.test(mesh.name);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => convert(m, cutout))
      : convert(mesh.material, cutout);
    mesh.frustumCulled = !(mesh as THREE.SkinnedMesh).isSkinnedMesh;
  });
  root.userData.tankPrepared = true;
}

/** The house cast's rehearsal loop if there is one, else an idle, else the first clip. */
export function pickClips(clips: THREE.AnimationClip[]) {
  const matching = (re: RegExp) => clips.filter((c) => re.test(c.name));
  const skit = matching(/Skit_Rehearsal/i);
  if (skit.length) return skit;
  const idle = matching(/idle|loop/i);
  return idle.length ? idle : clips.slice(0, 1);
}
