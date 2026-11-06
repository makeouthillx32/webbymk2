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
  // Walk-only avatars (2026-11-05): nobody in the house plays them, so they
  // stay hidden until someone walks as one. Each has front / side / back
  // cards (the coach a stride too); see poseAvatarView.
  { id: "rocker", label: "Rocker", rig: "Rocker_Rig" },
  { id: "professor", label: "Professor", rig: "Professor_Rig" },
  { id: "monk", label: "Monk", rig: "Monk_Rig" },
  { id: "coach", label: "Coach", rig: "Coach_Rig" },
  { id: "skater", label: "Skater", rig: "Skater_Rig" },
] as const;

export type AvatarId = (typeof AVATAR_PRESETS)[number]["id"];
export const DEFAULT_AVATAR: AvatarId = "joe";

export type AvatarGait = "walk" | "heavy" | "glide";

export type AvatarRig = {
  /** An AvatarId for the visitor's body; a house-cast id (vision/houseCast.ts) for a mirrored rig. */
  id: string;
  rig: THREE.Object3D;
  /** The rig's exported rotation; facing is applied as a yaw on top of it. */
  baseQuaternion: THREE.Quaternion;
  /** The rig's exported height off the floor. */
  baseY: number;
  /** World yaw the sprite faces at its exported rotation. */
  baseYaw: number;
  /** Its walk: the rig's own Walk clip, else its rehearsal clip; minus anything that would move the rig across the floor. */
  clip: THREE.AnimationClip | null;
  /** Its standing loop (breathing), when the rig has one. */
  idle: THREE.AnimationClip | null;
  /** Its seated loop, when the rig has one; a flat card sinks into the seat instead. */
  sit: THREE.AnimationClip | null;
  /** True when the rig carries real Walk/Idle clips: no code bob or rock on top. */
  animated: boolean;
  /** How it moves (tank_gait in Blender): "glide" rolls on and coasts to a stop. */
  gait: AvatarGait;
  /** Clip names that belong to this rig — the cast loop must leave them alone. */
  ownClips: Set<string>;
  /** Directional cards (tank_view in Blender), or null for a single-card rig like Joe. */
  views: AvatarViews | null;
};

export type ViewName = "front" | "side" | "back" | "walk";
export type AvatarViews = Partial<Record<ViewName, THREE.Object3D>> & { front: THREE.Object3D };

const nameOf = (object: THREE.Object3D) => String(object.userData?.name ?? object.name ?? "");

function rigFor(root: THREE.Object3D, preset: (typeof AVATAR_PRESETS)[number]) {
  return (
    root.children.find((child) => child.userData?.tank_avatar === preset.id) ??
    root.children.find((child) => {
      const name = nameOf(child);
      return name === preset.rig || name.startsWith(`${preset.rig}.`) || name.startsWith(`${preset.rig}_`);
    }) ??
    null
  );
}

/** The presets whose rig is actually in this cast, in picker order. */
export function availableAvatars(root: THREE.Object3D): { id: AvatarId; label: string }[] {
  return AVATAR_PRESETS.filter((preset) => rigFor(root, preset)).map(({ id, label }) => ({ id, label }));
}

/**
 * A rig tagged as an avatar in Blender ("Make avatar" in the Alt Director
 * panel sets tank_avatar = id) wins; otherwise rigs are found by their
 * top-level node name, like "Joe_Rig" (a ".001" suffix is fine).
 */
export function findAvatarRig(root: THREE.Object3D, id: string | null | undefined): { id: AvatarId; rig: THREE.Object3D } | null {
  const wanted = AVATAR_PRESETS.find((p) => p.id === id) ?? AVATAR_PRESETS[0];
  for (const preset of wanted.id === DEFAULT_AVATAR ? [wanted] : [wanted, AVATAR_PRESETS[0]]) {
    const rig = rigFor(root, preset);
    if (rig) return { id: preset.id, rig };
  }
  return null;
}

/**
 * A house-cast member's rig by cast id (tagged tank_avatar in Blender) or by
 * its rig name, with no fallback: a member without a rig simply isn't shown.
 */
export function findCastRig(root: THREE.Object3D, id: string, rigName: string): THREE.Object3D | null {
  return (
    root.children.find((child) => child.userData?.tank_avatar === id) ??
    root.children.find((child) => {
      const name = nameOf(child);
      return name === rigName || name.startsWith(`${rigName}.`) || name.startsWith(`${rigName}_`);
    }) ??
    null
  );
}

const yawOf = (v: THREE.Vector3) => Math.atan2(v.x, v.z);

export function prepareAvatar(found: { id: string; rig: THREE.Object3D }, clips: readonly THREE.AnimationClip[]): AvatarRig {
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
  const inPlace = (source: THREE.AnimationClip, fromZero: boolean) => {
    const tracks = source.tracks
      .filter((track) => {
        const { nodeName, propertyName } = THREE.PropertyBinding.parseTrackName(track.name);
        const node = nodeName ? rig.getObjectByName(nodeName) : null;
        if (!node) return true;
        if (node === rig) return false;
        // The root bone's position is the skit's blocking (walking between
        // marks); the visitor moves the rig, so drop it.
        const isRootBone = (node as THREE.Bone).isBone && !(node.parent as THREE.Bone | null)?.isBone;
        return !(isRootBone && propertyName === "position");
      })
      .map((track) => track.clone());
    // Blender exports a loop from frame 1 (t = 1/fps): start it at 0 so it loops without a hitch.
    const start = fromZero ? Math.min(...tracks.map((t) => t.times[0] ?? 0)) : 0;
    if (start > 0) tracks.forEach((t) => t.shift(-start));
    return new THREE.AnimationClip(`${source.name}__avatar`, fromZero ? -1 : source.duration, tracks);
  };
  const walkSource = own.find((c) => /_Walk$/.test(c.name));
  const idleSource = own.find((c) => /_Idle$/.test(c.name));
  const sitSource = own.find((c) => /_Sit$/.test(c.name));
  const legacy = own.find((c) => !/_(Walk|Idle|Sit)$/.test(c.name));
  const clip = walkSource ? inPlace(walkSource, true) : legacy ? inPlace(legacy, false) : null;
  const idle = idleSource ? inPlace(idleSource, true) : null;
  const sit = sitSource ? inPlace(sitSource, true) : null;
  const gaitTag = String(rig.userData?.tank_gait ?? "");
  const gait: AvatarGait = gaitTag === "glide" || gaitTag === "heavy" ? gaitTag : "walk";

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

  const cards: Partial<Record<ViewName, THREE.Object3D>> = {};
  rig.traverse((object) => {
    const view = object.userData?.tank_view as ViewName | undefined;
    if (view && !cards[view]) cards[view] = object;
  });
  const views = cards.front ? (cards as AvatarViews) : null;
  if (views) rig.userData.avatarView ??= { name: "front", flip: false };

  return {
    id,
    rig,
    baseQuaternion,
    baseY: castPose.position.y,
    baseYaw: yawOf(facing),
    clip,
    idle,
    sit,
    animated: Boolean(walkSource),
    gait,
    ownClips: new Set(own.map((c) => c.name)),
    views,
  };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Walking within this of straight at the camera shows the front card; of straight away, the back. */
const FRONT_CONE = (55 * Math.PI) / 180;
/** A view only changes once the angle is this far past its edge, so it doesn't flicker on the line. */
const VIEW_HYSTERESIS = (8 * Math.PI) / 180;
/** The Walk clips are timed for this speed (m/s); faster walking plays them faster. */
export const CLIP_WALK_SPEED = 1.5;
/** Stride cards alternate this often while walking (s). */
const STRIDE_SECONDS = 0.2;
/** Side-to-side rock while walking (radians), about the feet. */
const WALK_ROCK = 0.045;

/**
 * Which card a directional avatar shows: the camera always sees the card face
 * on (faceAvatar), so the view follows the walking heading relative to the
 * camera. Side cards face right and are mirrored for walking left; a stride
 * card, if there is one, alternates with the side card while walking.
 *
 * @param heading  world yaw the avatar walks towards (atan2(dx, dz)).
 * @param toCamera world yaw from the avatar to the camera.
 */
export function pickView(
  heading: number,
  toCamera: number,
  previous: { name: ViewName; flip: boolean },
): { name: "front" | "side" | "back"; flip: boolean } {
  const r = wrap(heading - toCamera);
  const off = Math.abs(r);
  const prev = previous.name === "walk" ? "side" : previous.name;
  const frontEdge = FRONT_CONE + (prev === "front" ? VIEW_HYSTERESIS : prev === "side" ? -VIEW_HYSTERESIS : 0);
  const backEdge = Math.PI - FRONT_CONE - (prev === "back" ? VIEW_HYSTERESIS : prev === "side" ? -VIEW_HYSTERESIS : 0);
  const name = off < frontEdge ? "front" : off > backEdge ? "back" : "side";
  // Moving to the viewer's right is +sin(r); the side card faces right.
  const flip = name === "side" ? (Math.abs(Math.sin(r)) < 0.05 ? previous.flip : Math.sin(r) < 0) : false;
  return { name, flip };
}

/** Show the card for this frame (no-op for single-card rigs). */
export function poseAvatarView(
  avatar: AvatarRig,
  heading: number,
  toCamera: number,
  walking: boolean,
  walkTime: number,
  animate = true,
) {
  const views = avatar.views;
  if (!views) return;
  const state = avatar.rig.userData.avatarView as { name: ViewName; flip: boolean };
  const picked = pickView(heading, toCamera, state);
  let name: ViewName = picked.name;
  if (name === "side" && walking && animate && views.walk && Math.floor(walkTime / STRIDE_SECONDS) % 2 === 1) name = "walk";
  state.name = name;
  state.flip = picked.flip;
  const shown = views[name] ?? views.front;
  // A rig with its own Walk clip walks for real; the rock is for flat cards.
  const rock = walking && animate && !avatar.animated ? Math.sin(walkTime * 9) * WALK_ROCK : 0;
  for (const card of Object.values(views)) {
    if (!card) continue;
    card.visible = card === shown;
  }
  shown.scale.x = picked.flip ? -1 : 1;
  shown.rotation.z = rock;
}

/** Put the rig back on its cast mark. */
export function restoreAvatar(avatar: AvatarRig) {
  const castPose = avatar.rig.userData.castPose as { position: THREE.Vector3; quaternion: THREE.Quaternion } | undefined;
  if (!castPose) return;
  avatar.rig.position.copy(castPose.position);
  avatar.rig.quaternion.copy(castPose.quaternion);
  if (avatar.views) poseAvatarView(avatar, 0, 0, false, 0);
}

const up = new THREE.Vector3(0, 1, 0);
const turn = new THREE.Quaternion();

/** Turn the sprite to face a world yaw (atan2(dx, dz) towards the viewer). */
export function faceAvatar(avatar: AvatarRig, yaw: number) {
  turn.setFromAxisAngle(up, yaw - avatar.baseYaw);
  avatar.rig.quaternion.copy(turn).multiply(avatar.baseQuaternion);
}
