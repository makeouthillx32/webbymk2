// Shared by the off-air room scenes and the alt director's walkable house.
import * as THREE from "three";
import { TILE_METRES, finishFor, finishMaterial, houseLights, projectWorldUvs } from "./houseFinish";

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

/** Blender's look, kept, but lit by the house lights like everything around it. */
export function toLit(material: THREE.Material): THREE.Material {
  const basic = toUnlit(material, false) as THREE.MeshBasicMaterial;
  const lit = new THREE.MeshLambertMaterial({ map: basic.map, color: basic.color, side: basic.side });
  lit.name = basic.name;
  basic.dispose();
  return lit;
}

/** The Blender object name of a mesh (a multi-material object's parts carry it on their group). */
function objectName(mesh: THREE.Object3D): string {
  const own = mesh.userData?.name;
  if (typeof own === "string" && own) return own;
  const parent = mesh.parent?.userData?.name;
  return typeof parent === "string" && parent ? parent : mesh.name;
}

/**
 * Convert every material once per loaded scene. Converted materials are
 * shared per source material (or per finish), so a 700-mesh house compiles a
 * few dozen shaders rather than one per mesh.
 *
 * `shell` (the default) gives the house its realistic, lit finishes
 * (houseFinish.ts) and a light rig. The cast's own file passes false: its
 * sprites stay unlit, and lights added twice would double the house's.
 */
export function prepareScene(root: THREE.Object3D, { shell = true }: { shell?: boolean } = {}) {
  if (root.userData.tankPrepared) return;
  root.updateMatrixWorld(true);
  const cache = new Map<string, THREE.Material>();
  const shared = <T extends THREE.Material>(key: string, make: () => T) => {
    let material = cache.get(key);
    if (!material) {
      material = make();
      cache.set(key, material);
    }
    return material;
  };
  let lit = false;
  const convert = (mesh: THREE.Mesh, material: THREE.Material, cutout: boolean, single: boolean) => {
    if (cutout || !shell) return shared(`unlit:${material.uuid}:${cutout ? 1 : 0}`, () => toUnlit(material, cutout));
    const finish = finishFor(objectName(mesh), material.name);
    if (!finish) {
      lit = true;
      return shared(`keep:${material.uuid}`, () => toLit(material));
    }
    if (!finish.unlit) lit = true;
    // A textured finish needs world-space texture coordinates on its own copy
    // of the geometry (a multi-material mesh keeps its own).
    if (finish.texture && single) projectWorldUvs(mesh, TILE_METRES[finish.texture]);
    return shared(`finish:${finish.key}:${material.side}`, () => finishMaterial(finish, material.side));
  };
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const cutout = (mesh as THREE.SkinnedMesh).isSkinnedMesh || /sprite/i.test(mesh.name);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => convert(mesh, m, cutout, false))
      : convert(mesh, mesh.material, cutout, true);
    mesh.frustumCulled = !(mesh as THREE.SkinnedMesh).isSkinnedMesh;
    // Lambert shading needs normals; an export without them would go black.
    const basic = !Array.isArray(mesh.material) && (mesh.material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    if (!basic && !mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
  });
  if (lit) root.add(houseLights());
  root.userData.tankPrepared = true;
}
