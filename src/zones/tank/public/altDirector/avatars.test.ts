import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { DEFAULT_AVATAR, faceAvatar, findAvatarRig, prepareAvatar, restoreAvatar } from "./avatars";

// A cast rig as GLTFLoader builds it: a top-level node with a root bone, a
// child bone and a sprite card; its skit clip walks the root bone around.
function castScene() {
  const scene = new THREE.Group();
  const makeRig = (name: string, yaw: number) => {
    const rig = new THREE.Group();
    rig.name = name;
    rig.userData.name = name;
    rig.position.set(3.4, 0.025, 0.6);
    rig.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const root = new THREE.Bone();
    root.name = `${name}_Root`;
    const head = new THREE.Bone();
    head.name = `${name}_Head`;
    root.add(head);
    rig.add(root);
    rig.add(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.8), new THREE.MeshBasicMaterial()));
    scene.add(rig);
    return rig;
  };
  makeRig("Malia_Rig", 0);
  const joe = makeRig("Joe_Rig", -1.45);
  const clip = new THREE.AnimationClip("Joe_Rig_Skit_Rehearsal_V13", 2, [
    new THREE.VectorKeyframeTrack("Joe_Rig_Root.position", [0, 2], [0, 0, 0, 2, 0, 0]),
    new THREE.QuaternionKeyframeTrack("Joe_Rig_Head.quaternion", [0, 2], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
    new THREE.VectorKeyframeTrack("Joe_Rig.position", [0, 2], [0, 0, 0, 1, 0, 0]),
  ]);
  const other = new THREE.AnimationClip("Malia_Rig_Skit_Rehearsal_V13", 2, []);
  return { scene, joe, clips: [clip, other] };
}

describe("alt director avatars", () => {
  test("Joe is the default, and an avatar whose rig isn't in the house falls back to Joe", () => {
    const { scene } = castScene();
    expect(DEFAULT_AVATAR).toBe("joe");
    expect(findAvatarRig(scene, "joe")?.id).toBe("joe");
    expect(findAvatarRig(scene, "malia")?.id).toBe("malia");
    expect(findAvatarRig(scene, "molly")?.id).toBe("joe");
    expect(findAvatarRig(scene, "../whatever")?.id).toBe("joe");
    expect(findAvatarRig(new THREE.Group(), "joe")).toBeNull();
  });

  test("a rig tagged in Blender (tank_avatar) wins over the name guess", () => {
    const { scene } = castScene();
    const tagged = new THREE.Group();
    tagged.name = "Pixel_Mystery_Rig001";
    tagged.userData.tank_avatar = "tyler";
    scene.add(tagged);
    expect(findAvatarRig(scene, "tyler")?.rig).toBe(tagged);
  });

  test("the walk clip keeps the poses but drops anything that moves the rig", () => {
    const { scene, clips } = castScene();
    const avatar = prepareAvatar(findAvatarRig(scene, "joe")!, clips);
    expect([...avatar.ownClips]).toEqual(["Joe_Rig_Skit_Rehearsal_V13"]);
    expect(avatar.clip?.tracks.map((t) => t.name)).toEqual(["Joe_Rig_Head.quaternion"]);
  });

  test("the card turns to face the camera and goes back to its cast mark", () => {
    const { scene, joe, clips } = castScene();
    const avatar = prepareAvatar(findAvatarRig(scene, "joe")!, clips);
    joe.position.set(0, 0, 0);
    faceAvatar(avatar, Math.PI / 2); // camera along +x
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(joe.quaternion);
    expect(facing.x).toBeCloseTo(1, 5);
    expect(facing.z).toBeCloseTo(0, 5);
    restoreAvatar(avatar);
    expect(joe.position.x).toBeCloseTo(3.4, 5);
    // A second mount still knows the cast pose, not wherever the visitor left it.
    joe.position.set(9, 0, 9);
    expect(prepareAvatar(findAvatarRig(scene, "joe")!, clips).baseY).toBeCloseTo(0.025, 5);
  });
});
