// The Tavern, in the house: the kitchen peninsula is the bar. Whoever holds
// the apron stands behind it, and every order waiting on a chit is a customer
// standing at the counter: the same random stranger (tavern/npcs.ts) the
// Tavern panel shows for that chit, so the panel and the house agree on who
// is waiting. They are idle strips on billboards, never rigged or walked.

import * as THREE from "three";
import { castGuests, npcHash, type TankNpc, type TankNpcPool } from "../../tavern/npcs";
import type { TavernSnapshot } from "../../tavernTypes";
import { CRISP_LAYER } from "../pixel/pixelPass";
import type { BarSpot } from "./houseStations";

/** Metres per sprite pixel: a 128 px cell stands about 1.7 m. */
const NPC_PX_METRES = 0.0135;

type Figure = {
  key: string;
  npc: TankNpc;
  sprite: THREE.Sprite;
  map: THREE.Texture;
  /** The strip has loaded and been uploaded. */
  ready: boolean;
  label: THREE.Sprite | null;
  phase: number;
};

export type BarCast = { bartender: { id: string; name: string } | null; guests: Array<{ id: string; createdAt: string }> };

/** Who is at the bar right now, from the public Tavern snapshot. */
export function barCast(snapshot: TavernSnapshot | null): BarCast {
  if (!snapshot?.enabled) return { bartender: null, guests: [] };
  const shift = snapshot.shift && snapshot.shift.status === "active" ? snapshot.shift : null;
  return {
    bartender: shift ? { id: shift.bartenderId, name: shift.bartenderName } : null,
    guests: snapshot.chits.filter((c) => c.outcome === "pending").map((c) => ({ id: c.id, createdAt: c.createdAt })),
  };
}

// One image per strip, shared; each figure wraps it in its own texture so
// it can show its own frame.
const strips = new Map<string, HTMLImageElement>();

function stripTexture(npc: TankNpc): THREE.Texture {
  let image = strips.get(npc.strip);
  if (!image) {
    image = new Image();
    image.crossOrigin = "anonymous";
    image.src = npc.strip;
    strips.set(npc.strip, image);
  }
  const texture = new THREE.Texture(image);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const loaded = (image: unknown) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;

function nameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 20;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.font = "bold 12px ui-monospace, Menlo, Consolas, monospace";
    const label = `🍺 ${name}`.slice(0, 22);
    const width = Math.min(126, ctx.measureText(label).width + 10);
    ctx.fillStyle = "#000000b0";
    ctx.fillRect((128 - width) / 2, 2, width, 16);
    ctx.fillStyle = "#fbbf24";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 64, 10.5);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sprite.scale.set(1.0, 0.16, 1);
  sprite.center.set(0.5, 0);
  sprite.layers.enable(CRISP_LAYER);
  sprite.renderOrder = 11;
  return sprite;
}

export class TavernBar {
  readonly group = new THREE.Group();
  private figures = new Map<string, Figure>();
  private time = 0;

  constructor(private spots: { bartender: BarSpot; guests: BarSpot[] }) {
    this.group.name = "Tavern bar";
  }

  /** Put the right people at the bar; unchanged figures keep their place and loop. */
  set(cast: BarCast, pool: TankNpcPool | null): void {
    const wanted = new Map<string, { npc: TankNpc; at: BarSpot; label: string | null }>();
    const npcs = pool?.npcs ?? [];
    if (npcs.length) {
      const guests = cast.guests.slice(0, this.spots.guests.length);
      const faces = castGuests(guests, npcs);
      const order = [...guests].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      order.forEach((guest, i) => {
        const npc = faces.get(guest.id);
        if (npc) wanted.set(`guest:${guest.id}`, { npc, at: this.spots.guests[i], label: null });
      });
      if (cast.bartender) {
        const used = new Set([...faces.values()].map((n) => n.id));
        const start = npcHash(`bartender:${cast.bartender.id}`) % npcs.length;
        let npc = npcs[start];
        for (let step = 0; step < npcs.length; step += 1) {
          const candidate = npcs[(start + step) % npcs.length];
          if (!used.has(candidate.id)) {
            npc = candidate;
            break;
          }
        }
        wanted.set(`bartender:${cast.bartender.id}`, { npc, at: this.spots.bartender, label: cast.bartender.name });
      }
    }

    for (const [key, figure] of this.figures) {
      if (wanted.get(key)?.npc.id === figure.npc.id) continue;
      this.remove(key, figure);
    }
    for (const [key, want] of wanted) {
      let figure = this.figures.get(key);
      if (!figure) {
        const map = stripTexture(want.npc);
        map.repeat.set(1 / want.npc.frames, 1);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 }));
        const [cw, ch] = pool?.cell ?? [96, 128];
        sprite.scale.set(cw * NPC_PX_METRES, ch * NPC_PX_METRES, 1);
        sprite.center.set(0.5, 0);
        sprite.layers.enable(CRISP_LAYER);
        sprite.renderOrder = 9;
        const label = want.label ? nameLabel(want.label) : null;
        if (label) label.position.y = ch * NPC_PX_METRES + 0.04;
        const holder = new THREE.Group();
        holder.add(sprite);
        if (label) holder.add(label);
        this.group.add(holder);
        sprite.visible = false;
        figure = { key, npc: want.npc, sprite, map, ready: false, label, phase: (npcHash(key) % 1000) / 1000 };
        this.figures.set(key, figure);
      }
      figure.sprite.parent?.position.set(want.at.x, 0, want.at.z);
    }
  }

  update(dt: number, animate: boolean): void {
    if (animate) this.time += dt;
    for (const figure of this.figures.values()) {
      if (!figure.ready) {
        if (!loaded(figure.map.image)) continue;
        figure.map.needsUpdate = true;
        figure.sprite.visible = true;
        figure.ready = true;
      }
      const { frames, fps } = figure.npc;
      const frame = Math.floor((this.time + figure.phase * 3) * fps) % frames;
      figure.map.offset.x = frame / frames;
    }
  }

  private remove(key: string, figure: Figure) {
    const holder = figure.sprite.parent;
    if (holder) this.group.remove(holder);
    figure.sprite.material.dispose();
    figure.map.dispose();
    if (figure.label) {
      figure.label.material.map?.dispose();
      figure.label.material.dispose();
    }
    this.figures.delete(key);
  }

  dispose(): void {
    for (const [key, figure] of [...this.figures]) this.remove(key, figure);
  }
}
