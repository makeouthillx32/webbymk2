// Plays the house's pixel effects (houseEffects.ts) in a three.js scene,
// driven by who the cast mirror shows:
//   - someone a camera just found  -> "spotted" where they stand
//   - someone no camera sees now   -> "vanish" where they were
//   - someone walking              -> a puff of "step" dust every stride
//   - a pet still for a while      -> "sleep" Zs over it
//   - a pet settled by its person  -> "hearts" over it (wins over sleep)
//
// Each effect bakes once per page into a flipbook atlas (nearest filtered,
// so it stays pixel-crisp) and plays on a camera-facing sprite. Plain
// three.js; each surface owns one HouseFx and calls update() per frame.

import * as THREE from "three";
import { HOUSE_EFFECTS, bakeEffect, type HouseEffect, type HouseEffectId } from "./houseEffects";
import type { ShownMember } from "../altDirector/castMirror";

/** Metres per effect pixel on a person (a person is ~64 px tall). */
export const PX_METRES = 0.027;
const KIND_SCALE: Record<string, number> = { human: 1, dog: 0.62, cat: 0.5 };
const HEAD_HEIGHT: Record<string, number> = { human: 1.75, dog: 0.62, cat: 0.38 };
const STRIDE_SECONDS = 0.32;
export const SLEEP_AFTER_SECONDS = 45;
const HEARTS_NEAR_M = 1.1;
const HEARTS_APART_M = 1.5;
/** Effects sit this much nearer the camera than the card they decorate, so they never z-fight it. */
const TOWARD_EYE_M = 0.18;

type Atlas = { effect: HouseEffect; texture: THREE.Texture; cols: number; rows: number; frames: number };
const atlases = new Map<HouseEffectId, Atlas | null>();

function atlasFor(id: HouseEffectId): Atlas | null {
  if (atlases.has(id)) return atlases.get(id) ?? null;
  let made: Atlas | null = null;
  if (typeof document !== "undefined") {
    const effect = HOUSE_EFFECTS[id];
    const { w, h, frames } = bakeEffect(effect, 7);
    const cols = Math.min(frames.length, 8);
    const rows = Math.ceil(frames.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cols * w;
    canvas.height = rows * h;
    const context = canvas.getContext("2d");
    if (context) {
      frames.forEach((data, i) => context.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), (i % cols) * w, Math.floor(i / cols) * h));
      const texture = new THREE.CanvasTexture(canvas);
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      made = { effect, texture, cols, rows, frames: frames.length };
    }
  }
  atlases.set(id, made);
  return made;
}

type Playing = {
  id: HouseEffectId;
  sprite: THREE.Sprite;
  atlas: Atlas;
  t: number;
  /** A loop that follows a member's head, keyed by member id. */
  follow: string | null;
  x: number;
  y: number;
  z: number;
};

type Track = { x: number; z: number; kind: string; stride: number; foot: number; stillFor: number; loving: boolean };

export class HouseFx {
  readonly group = new THREE.Group();
  private readonly playing: Playing[] = [];
  private readonly tracks = new Map<string, Track>();
  private readonly toEye = new THREE.Vector3();

  constructor() {
    this.group.name = "house-fx";
    this.group.renderOrder = 10;
  }

  /** How many effects are on screen, by id (for tests and diagnostics). */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.playing) out[p.id] = (out[p.id] ?? 0) + 1;
    return out;
  }

  update(dt: number, members: readonly ShownMember[], eye: THREE.Vector3, animate = true) {
    this.group.visible = animate;
    const seen = new Set<string>();
    for (const m of members) {
      seen.add(m.id);
      let track = this.tracks.get(m.id);
      if (!track) {
        track = { x: m.x, z: m.z, kind: m.kind, stride: 0, foot: 1, stillFor: 0, loving: false };
        this.tracks.set(m.id, track);
        if (animate) this.play("spotted", m.x, 0, m.z, m.kind);
      }
      track.x = m.x;
      track.z = m.z;
      track.kind = m.kind;
      if (m.walking) {
        track.stillFor = 0;
        track.stride += dt;
        if (track.stride >= STRIDE_SECONDS) {
          track.stride = 0;
          track.foot = -track.foot;
          if (animate) this.play("step", m.x + track.foot * 0.08, 0, m.z, m.kind);
        }
      } else {
        track.stillFor += dt;
        track.stride = STRIDE_SECONDS; // the first stride kicks dust at once
      }
    }
    for (const [id, track] of this.tracks) {
      if (seen.has(id)) continue;
      this.tracks.delete(id);
      if (animate) this.play("vanish", track.x, 0, track.z, track.kind);
    }

    // Pets: hearts by a person they're settled next to, else Zs once asleep.
    const people = members.filter((m) => m.kind === "human");
    const wantLoop = new Map<string, HouseEffectId>();
    for (const m of members) {
      if (m.kind === "human") continue;
      const track = this.tracks.get(m.id)!;
      const nearest = Math.min(Infinity, ...people.map((p) => Math.hypot(p.x - m.x, p.z - m.z)));
      track.loving = !m.walking && nearest <= (track.loving ? HEARTS_APART_M : HEARTS_NEAR_M);
      if (track.loving) wantLoop.set(m.id, "hearts");
      else if (track.stillFor >= SLEEP_AFTER_SECONDS) wantLoop.set(m.id, "sleep");
    }
    for (let i = this.playing.length - 1; i >= 0; i--) {
      const p = this.playing[i];
      if (p.follow && wantLoop.get(p.follow) !== p.id) this.remove(i);
    }
    for (const [id, effect] of wantLoop) {
      if (!animate) continue;
      if (this.playing.some((p) => p.follow === id && p.id === effect)) continue;
      const track = this.tracks.get(id)!;
      const played = this.play(effect, track.x, HEAD_HEIGHT[track.kind] ?? 1, track.z, track.kind);
      if (played) played.follow = id;
    }

    // Advance, place and frame every effect.
    for (let i = this.playing.length - 1; i >= 0; i--) {
      const p = this.playing[i];
      p.t += dt;
      const { effect } = p.atlas;
      if (!effect.loop && p.t >= effect.duration) {
        this.remove(i);
        continue;
      }
      if (p.follow) {
        const track = this.tracks.get(p.follow);
        if (track) {
          p.x = track.x;
          p.z = track.z;
        }
      }
      this.toEye.set(eye.x - p.x, 0, eye.z - p.z);
      const length = this.toEye.length() || 1;
      p.sprite.position.set(p.x + (this.toEye.x / length) * TOWARD_EYE_M, p.y, p.z + (this.toEye.z / length) * TOWARD_EYE_M);
      const frame = Math.min(p.atlas.frames - 1, Math.floor((effect.loop ? p.t % effect.duration : p.t) * effect.fps));
      const map = p.sprite.material.map!;
      map.offset.set((frame % p.atlas.cols) / p.atlas.cols, 1 - (Math.floor(frame / p.atlas.cols) + 1) / p.atlas.rows);
    }
  }

  private play(id: HouseEffectId, x: number, y: number, z: number, kind: string): Playing | null {
    const atlas = atlasFor(id);
    if (!atlas) return null;
    const map = atlas.texture.clone(); // shares the baked image; its own frame offset
    map.repeat.set(1 / atlas.cols, 1 / atlas.rows);
    const material = new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: true });
    const sprite = new THREE.Sprite(material);
    const [w, h] = atlas.effect.size;
    const [ox, oy] = atlas.effect.origin;
    const scale = PX_METRES * (KIND_SCALE[kind] ?? 1);
    sprite.center.set(ox / w, 1 - oy / h);
    sprite.scale.set(w * scale, h * scale, 1);
    sprite.renderOrder = 10;
    sprite.frustumCulled = false;
    this.group.add(sprite);
    const playing: Playing = { id, sprite, atlas, t: 0, follow: null, x, y, z };
    this.playing.push(playing);
    return playing;
  }

  private remove(index: number) {
    const [p] = this.playing.splice(index, 1);
    this.group.remove(p.sprite);
    p.sprite.material.map?.dispose();
    p.sprite.material.dispose();
  }

  dispose() {
    while (this.playing.length) this.remove(this.playing.length - 1);
    this.tracks.clear();
  }
}
