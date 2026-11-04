// The house cast as the real house sees it, for any scene that carries cast
// rigs: the walkable house (AltDirector3D), the room scenes (RoomScene3D) and
// the mini game previews (gamePreviews.ts).
//
// Rules (2026-11-04):
//   - No scripted skit. The rehearsal clips never play; a rig only moves when
//     the person it mirrors moves (vision/houseCast.ts).
//   - A member nobody can see is not rendered. Their rig stays hidden until a
//     camera finds them again (the server keeps where they were last seen).
//   - While their person walks, a rig plays its own pose loop in place
//     (rehearsal minus root motion); standing still, it holds.
//   - Paper sprites face whichever camera is looking.
//
// Plain three.js, no React: each surface owns one and calls update() per frame.

import * as THREE from "three";
import { CAST_RIGS } from "../../vision/houseCast";
import { toThreeFloor } from "../../vision/fisheyeFloor";
import { faceAvatar, findCastRig, prepareAvatar, restoreAvatar, type AvatarRig } from "./avatars";
import { readHouseCast } from "./houseCastStore";

/** How quickly a rig closes on its person's latest position (1/s). Updates arrive once a second. */
const EASE_PER_SECOND = 2.5;
/** Still this far from where its person is = still walking there. */
const WALKING_GAP_M = 0.12;

export class CastMirror {
  private readonly rigs = new Map<string, AvatarRig>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly positions = new Map<string, { x: number; z: number }>();
  private readonly mixer: THREE.AnimationMixer;
  private shownKey = "";

  /**
   * @param root   the scene holding the cast rigs (top-level children).
   * @param clips  the scene's clips (only each rig's own pose loop is used).
   * @param skip   a rig to leave alone: the visitor's own body.
   * @param room   only mirror members seen in this room (a room scene).
   */
  constructor(
    root: THREE.Object3D,
    clips: readonly THREE.AnimationClip[],
    private readonly options: { skip?: THREE.Object3D | null; room?: string | null } = {},
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [id, { rig: rigName }] of Object.entries(CAST_RIGS)) {
      const rig = findCastRig(root, id, rigName);
      if (!rig || rig === options.skip) continue;
      const avatar = prepareAvatar({ id, rig }, clips);
      rig.visible = false;
      this.rigs.set(id, avatar);
      if (avatar.clip) {
        const action = this.mixer.clipAction(avatar.clip);
        action.play();
        action.paused = true;
        this.actions.set(id, action);
      }
    }
  }

  /** Cast ids currently rendered, comma-joined (changes only when someone appears or leaves). */
  get shown(): string {
    return this.shownKey;
  }

  update(dt: number, eye: THREE.Vector3, animate = true, now = Date.now()) {
    const shown: string[] = [];
    const ease = Math.min(1, dt * EASE_PER_SECOND);
    for (const member of readHouseCast(now)) {
      const avatar = this.rigs.get(member.id);
      if (!avatar) continue;
      if (this.options.room && member.room !== this.options.room) continue;
      const target = toThreeFloor(member);
      let p = this.positions.get(member.id);
      // Appearing (or reappearing): start where they are, never glide in
      // through the walls from wherever they were last seen.
      if (!p || !avatar.rig.visible) {
        p = { x: target.x, z: target.z };
        this.positions.set(member.id, p);
      }
      p.x += (target.x - p.x) * ease;
      p.z += (target.z - p.z) * ease;
      avatar.rig.visible = true;
      avatar.rig.position.set(p.x, avatar.baseY, p.z);
      faceAvatar(avatar, Math.atan2(eye.x - p.x, eye.z - p.z));
      const walking = member.moving || Math.hypot(target.x - p.x, target.z - p.z) > WALKING_GAP_M;
      const action = this.actions.get(member.id);
      if (action) action.paused = !(walking && animate);
      shown.push(member.id);
    }
    for (const [id, avatar] of this.rigs) {
      if (shown.includes(id)) continue;
      avatar.rig.visible = false;
      const action = this.actions.get(id);
      if (action) action.paused = true;
    }
    this.shownKey = shown.sort().join(",");
    this.mixer.update(dt);
  }

  /** Put every rig back as it was loaded (the GLB is cached across mounts). */
  dispose() {
    this.mixer.stopAllAction();
    for (const avatar of this.rigs.values()) {
      if (avatar.clip) this.mixer.uncacheClip(avatar.clip);
      restoreAvatar(avatar);
      avatar.rig.visible = true;
    }
    this.rigs.clear();
    this.actions.clear();
  }
}
