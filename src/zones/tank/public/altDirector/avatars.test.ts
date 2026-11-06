import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import {
  DEFAULT_AVATAR,
  availableAvatars,
  faceAvatar,
  findAvatarRig,
  pickView,
  poseAvatarView,
  prepareAvatar,
  restoreAvatar,
} from "./avatars";

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
  // A directional avatar as the export builds it: a rig with one card per view.
  function directional(views: string[] = ["front", "side", "back"]) {
    const scene = new THREE.Group();
    const rig = new THREE.Group();
    rig.name = "Coach_Rig";
    rig.userData.tank_avatar = "coach";
    rig.position.set(1, 0.025, 8);
    for (const view of views) {
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), new THREE.MeshBasicMaterial());
      card.name = `Coach_Sprite_${view}`;
      card.userData.tank_view = view;
      rig.add(card);
    }
    scene.add(rig);
    return { scene, rig, cards: Object.fromEntries(rig.children.map((c) => [c.userData.tank_view, c])) };
  }

  test("the picker lists only avatars whose rig is in the cast", () => {
    const { scene } = castScene();
    scene.add(directional().rig);
    expect(availableAvatars(scene).map((a) => a.id)).toEqual(["joe", "malia", "coach"]);
  });

  test("the view follows the walking heading relative to the camera", () => {
    const start = { name: "front" as const, flip: false };
    // Camera to the south (+z); walking towards it shows the front, away the back.
    expect(pickView(0, 0, start).name).toBe("front");
    expect(pickView(Math.PI, 0, start).name).toBe("back");
    // Walking east (+x) with the camera at +z: the viewer's right, so the side card unmirrored.
    expect(pickView(Math.PI / 2, 0, start)).toEqual({ name: "side", flip: false });
    expect(pickView(-Math.PI / 2, 0, start)).toEqual({ name: "side", flip: true });
    // Near the edge it keeps what it shows (no flicker).
    const edge = (57 * Math.PI) / 180;
    expect(pickView(edge, 0, { name: "front", flip: false }).name).toBe("front");
    expect(pickView(edge, 0, { name: "side", flip: false }).name).toBe("side");
  });

  test("one card shows at a time, the stride alternates while walking, and restore shows the front", () => {
    const { scene, cards } = directional(["front", "side", "back", "walk"]);
    const avatar = prepareAvatar(findAvatarRig(scene, "coach")!, []);
    expect(avatar.views && Object.keys(avatar.views).sort()).toEqual(["back", "front", "side", "walk"]);
    const shown = () => Object.entries(cards).filter(([, c]) => c.visible).map(([k]) => k);
    poseAvatarView(avatar, -Math.PI / 2, 0, true, 0.05);
    expect(shown()).toEqual(["side"]);
    expect(cards.side.scale.x).toBe(-1);
    poseAvatarView(avatar, -Math.PI / 2, 0, true, 0.25);
    expect(shown()).toEqual(["walk"]);
    expect(cards.walk.scale.x).toBe(-1);
    poseAvatarView(avatar, -Math.PI / 2, 0, false, 0.25);
    expect(shown()).toEqual(["side"]);
    poseAvatarView(avatar, Math.PI, 0, false, 0);
    expect(shown()).toEqual(["back"]);
    restoreAvatar(avatar);
    expect(shown()).toEqual(["front"]);
    expect(cards.front.rotation.z).toBe(0);
  });

  test("a single-card rig like Joe has no views and is left alone", () => {
    const { scene, clips } = castScene();
    const avatar = prepareAvatar(findAvatarRig(scene, "joe")!, clips);
    expect(avatar.views).toBeNull();
    poseAvatarView(avatar, 1, 0, true, 0.3);
  });
});
