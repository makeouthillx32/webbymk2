// Alt director avatars: the house cast's own sprites (the poseable rigs in
// the Blender house). Signed-in viewers walk as one of them; Joe is the
// default. The picker itself is wired up elsewhere — this module only needs an
// avatar id and resolves it against the rigs that are actually in house.glb,
// falling back to Joe, so a preset whose rig hasn't been exported yet is
// harmless.

import * as THREE from "three";

export const AVATAR_PRESETS = [
  { id: "joe", label: "Joe", rig: "Joe_Rig" },
  { id: "tyler", label: "Tyler", rig: "Pixel_Tyler_Rig" },
  { id: "malia", label: "Malia", rig: "Malia_Rig" },
  { id: "oly", label: "Oly", rig: "Oly_Rig" },
  { id: "molly", label: "Molly", rig: "Molly_Rig" },
  { id: "james", label: "James", rig: "James_Rig" },
  { id: "kitty", label: "Kitty", rig: "Kitty_Rig" },
] as const;

export type AvatarId = (typeof AVATAR_PRESETS)[number]["id"];
export const DEFAULT_AVATAR: AvatarId = "joe";

export type AvatarRig = {
  id: AvatarId;
  rig: THREE.Object3D;
  /** The rig's exported rotation; facing is applied as a yaw on top of it. */
  baseQuaternion: THREE.Quaternion;
  /** The rig's exported height off the floor. */
  baseY: number;
  /** World yaw the sprite faces at its exported rotation. */
  baseYaw: number;
  /** Its rehearsal clip minus anything that would move the rig across the floor. */
  clip: THREE.AnimationClip | null;
  /** Clip names that belong to this rig — the cast loop must leave them alone. */
  ownClips: Set<string>;
};

const nameOf = (object: THREE.Object3D) => String(object.userData?.name ?? object.name ?? "");

/** Rigs are top-level nodes named like "Joe_Rig" (a ".001" suffix is fine). */
export function findAvatarRig(root: THREE.Object3D, id: string | null | undefined): { id: AvatarId; rig: THREE.Object3D } | null {
  const wanted = AVATAR_PRESETS.find((p) => p.id === id) ?? AVATAR_PRESETS[0];
  for (const preset of wanted.id === DEFAULT_AVATAR ? [wanted] : [wanted, AVATAR_PRESETS[0]]) {
    const rig = root.children.find((child) => {
      const name = nameOf(child);
      return name === preset.rig || name.startsWith(`${preset.rig}.`) || name.startsWith(`${preset.rig}_`);
    });
    if (rig) return { id: preset.id, rig };
  }
  return null;
}

const yawOf = (v: THREE.Vector3) => Math.atan2(v.x, v.z);

export function prepareAvatar(found: { id: AvatarId; rig: THREE.Object3D }, clips: readonly THREE.AnimationClip[]): AvatarRig {
  const { id, rig } = found;
  // The loaded scene is cached across mounts: remember where the rig stood in
  // the cast so a later mount (or a signed-out viewer) gets it back there.
  rig.userData.castPose ??= { position: rig.position.clone(), quaternion: rig.quaternion.clone() };
  const castPose = rig.userData.castPose as { position: THREE.Vector3; quaternion: THREE.Quaternion };
  const baseQuaternion = castPose.quaternion.clone();
  // A sprite card faces its local +Z; a rig exported lying down (rotated 90°
  // about X) faces its local +Y instead.
  let facing = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQuaternion);
  if (Math.hypot(facing.x, facing.z) < 0.3) facing = new THREE.Vector3(0, 1, 0).applyQuaternion(baseQuaternion);

  const rigName = nameOf(rig);
  const own = clips.filter((clip) => clip.name.startsWith(rigName) || clip.name.startsWith(rig.name));
  let clip: THREE.AnimationClip | null = null;
  if (own[0]) {
    const tracks = own[0].tracks.filter((track) => {
      const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
      const node = nodeName ? rig.getObjectByName(nodeName) : null;
      if (!node) return true;
      if (node === rig) return false;
      // The root bone's position is the skit's blocking (walking between
      // marks); the visitor moves the rig, so drop it.
      const isRootBone = (node as THREE.Bone).isBone && !(node.parent as THREE.Bone | null)?.isBone;
      return !(isRootBone && propertyName === "position");
    });
    clip = new THREE.AnimationClip(`${own[0].name}__avatar`, own[0].duration, tracks);
  }

  // Seen from every side now, and with its own materials so nothing else changes.
  rig.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh.userData.avatarMaterial) return;
    mesh.userData.avatarMaterial = true;
    const toDouble = (m: THREE.Material) => {
      const copy = m.clone();
      copy.side = THREE.DoubleSide;
      return copy;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toDouble) : toDouble(mesh.material);
  });

  return {
    id,
    rig,
    baseQuaternion,
    baseY: castPose.position.y,
    baseYaw: yawOf(facing),
    clip,
    ownClips: new Set(own.map((c) => c.name)),
  };
}

/** Put the rig back on its cast mark. */
export function restoreAvatar(avatar: AvatarRig) {
  const castPose = avatar.rig.userData.castPose as { position: THREE.Vector3; quaternion: THREE.Quaternion } | undefined;
  if (!castPose) return;
  avatar.rig.position.copy(castPose.position);
  avatar.rig.quaternion.copy(castPose.quaternion);
}

const up = new THREE.Vector3(0, 1, 0);
const turn = new THREE.Quaternion();

/** Turn the sprite to face a world yaw (atan2(dx, dz) towards the viewer). */
export function faceAvatar(avatar: AvatarRig, yaw: number) {
  turn.setFromAxisAngle(up, yaw - avatar.baseYaw);
  avatar.rig.quaternion.copy(turn).multiply(avatar.baseQuaternion);
}
