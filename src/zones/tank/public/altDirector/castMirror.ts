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
//   - Seats (2026-11-06): a member who stays still beside a free seat in their
//     room for SIT_AFTER_MS sits on it (people sink into it, pets get up on
//     it, a rig with a Sit clip plays it) and stands when they move off.
//
// Plain three.js, no React: each surface owns one and calls update() per frame.

import * as THREE from "three";
import { CAST_RIGS } from "../../vision/houseCast";
import { toThreeFloor } from "../../vision/fisheyeFloor";
import { faceAvatar, findCastRig, prepareAvatar, restoreAvatar, type AvatarRig } from "./avatars";
import { readHouseCast } from "./houseCastStore";
import { seatLift, type HouseSeat } from "./houseMap";

/** How quickly a rig closes on its person's latest position (1/s). Updates arrive once a second. */
const EASE_PER_SECOND = 2.5;
/** Still this far from where its person is = still walking there. */
const WALKING_GAP_M = 0.12;

/** Still beside a seat this long = sitting down (detections jitter; a pause in passing isn't a sit). */
export const SIT_AFTER_MS = 3000;
/** A seated member whose person is reported this far from the seat has got up. */
const STAND_AWAY_M = 1.3;

/** A seat near (x, z) in `room` for a body of `kind`, skipping seats already `taken`. */
export type SeatFinder = (x: number, z: number, room: string, kind: string, taken: ReadonlySet<string>) => HouseSeat | null;

/** A member as one surface renders them this frame (three.js floor coordinates). */
export type ShownMember = { id: string; kind: string; x: number; z: number; walking: boolean; seated: boolean };

export class CastMirror {
  private shownList: ShownMember[] = [];
  private readonly rigs = new Map<string, AvatarRig>();
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly positions = new Map<string, { x: number; z: number; lift: number }>();
  private readonly sitting = new Map<string, { seat: HouseSeat | null; stillSince: number | null }>();
  private readonly sitActions = new Map<string, THREE.AnimationAction>();
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
    private readonly options: { skip?: THREE.Object3D | null; room?: string | null; seatFor?: SeatFinder } = {},
  ) {
    this.mixer = new THREE.AnimationMixer(root);
    // Walk-only avatars (a rig tagged tank_avatar that is nobody in the house)
    // wait out of sight until a visitor walks as one.
    for (const child of root.children) {
      const id = child.userData?.tank_avatar;
      if (typeof id === "string" && !(id in CAST_RIGS) && child !== options.skip) child.visible = false;
    }
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
      if (avatar.sit) {
        const sit = this.mixer.clipAction(avatar.sit);
        sit.play();
        sit.weight = 0;
        this.sitActions.set(id, sit);
      }
    }
  }

  /** Sit down, stay seated or get up, from this tick's report of where they are. */
  private seatOf(id: string, kind: string, room: string, target: { x: number; z: number }, moving: boolean, now: number) {
    const finder = this.options.seatFor;
    let state = this.sitting.get(id);
    if (!state) {
      state = { seat: null, stillSince: null };
      this.sitting.set(id, state);
    }
    if (!finder) return null;
    if (state.seat) {
      if (moving || Math.hypot(state.seat.at[0] - target.x, state.seat.at[2] - target.z) > STAND_AWAY_M) {
        state.seat = null;
        state.stillSince = null;
      }
      return state.seat;
    }
    if (moving) {
      state.stillSince = null;
      return null;
    }
    const taken = new Set<string>();
    for (const [other, s] of this.sitting) if (other !== id && s.seat) taken.add(s.seat.id);
    const seat = finder(target.x, target.z, room, kind, taken);
    if (!seat) {
      state.stillSince = null;
      return null;
    }
    state.stillSince ??= now;
    if (now - state.stillSince >= SIT_AFTER_MS) state.seat = seat;
    return state.seat;
  }

  /** Cast ids currently rendered, comma-joined (changes only when someone appears or leaves). */
  get shown(): string {
    return this.shownKey;
  }

  /** Who is rendered right now, where, and whether they're walking (for effects). */
  get members(): readonly ShownMember[] {
    return this.shownList;
  }

  update(dt: number, eye: THREE.Vector3, animate = true, now = Date.now()) {
    const shown: string[] = [];
    const list: ShownMember[] = [];
    const ease = Math.min(1, dt * EASE_PER_SECOND);
    for (const member of readHouseCast(now)) {
      const avatar = this.rigs.get(member.id);
      if (!avatar) continue;
      if (this.options.room && member.room !== this.options.room) continue;
      const reported = toThreeFloor(member);
      const seat = this.seatOf(member.id, member.kind, member.room, reported, member.moving, now);
      // Seated, they settle onto the seat itself, not the feet in front of it.
      const target = seat ? { x: seat.at[0], z: seat.at[2] } : reported;
      const lift = seat ? seatLift(seat.at[1], member.kind !== "human" ? "animal" : avatar.sit ? "sit-clip" : "flat") : 0;
      let p = this.positions.get(member.id);
      // Appearing (or reappearing): start where they are, never glide in
      // through the walls from wherever they were last seen.
      if (!p || !avatar.rig.visible) {
        p = { x: target.x, z: target.z, lift };
        this.positions.set(member.id, p);
      }
      p.x += (target.x - p.x) * ease;
      p.z += (target.z - p.z) * ease;
      p.lift += (lift - p.lift) * Math.min(1, dt * 6);
      avatar.rig.visible = true;
      avatar.rig.position.set(p.x, avatar.baseY + p.lift, p.z);
      faceAvatar(avatar, Math.atan2(eye.x - p.x, eye.z - p.z));
      const walking = !seat && (member.moving || Math.hypot(target.x - p.x, target.z - p.z) > WALKING_GAP_M);
      const action = this.actions.get(member.id);
      if (action) action.paused = !(walking && animate);
      const sit = this.sitActions.get(member.id);
      if (sit) sit.weight += ((seat ? 1 : 0) - sit.weight) * Math.min(1, dt * 12);
      shown.push(member.id);
      list.push({ id: member.id, kind: member.kind, x: p.x, z: p.z, walking, seated: Boolean(seat) });
    }
    for (const [id, avatar] of this.rigs) {
      if (shown.includes(id)) continue;
      avatar.rig.visible = false;
      this.sitting.delete(id);
      const action = this.actions.get(id);
      if (action) action.paused = true;
    }
    this.shownKey = shown.sort().join(",");
    this.shownList = list;
    this.mixer.update(dt);
  }

  /** Put every rig back as it was loaded (the GLB is cached across mounts). */
  dispose() {
    this.mixer.stopAllAction();
    for (const avatar of this.rigs.values()) {
      if (avatar.clip) this.mixer.uncacheClip(avatar.clip);
      if (avatar.sit) this.mixer.uncacheClip(avatar.sit);
      restoreAvatar(avatar);
      avatar.rig.visible = true;
    }
    this.rigs.clear();
    this.actions.clear();
    this.sitActions.clear();
    this.sitting.clear();
    this.shownList = [];
  }
}
