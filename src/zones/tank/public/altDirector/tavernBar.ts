// The Tavern, in the house: the kitchen peninsula is the bar, and the game is
// played right there. When someone takes the apron, customers come in at the
// front door and walk to the counter; every order waiting on a chit is one
// of them standing there with a speech bubble saying what they want (the
// same random stranger, tavern/npcs.ts, the Tavern panel shows for that
// chit, so every screen agrees on who is waiting). The bartender serves by
// walking up to them and pressing E (AltDirector3D); served, they say cheers
// and walk back out; left waiting too long, they storm off. Another viewer's
// bartender is a stranger behind the bar with their name over them; your
// own shift is your own avatar. Idle strips on billboards, never rigged.

import * as THREE from "three";
import { castGuests, npcHash, type TankNpc, type TankNpcPool } from "../../tavern/npcs";
import { orderBubble, orderResponse } from "../../tavern/orders";
import type { TavernSnapshot } from "../../tavernTypes";
import { CRISP_LAYER } from "../pixel/pixelPass";
import type { HouseMap } from "./houseMap";
import type { BarSpot } from "./houseStations";
import { findPath, houseEntrance, pathLength, pointAlong, type Pt } from "./tavernWalk";

/** Metres per sprite pixel: a 128 px cell stands about 1.7 m. */
const NPC_PX_METRES = 0.0135;
/** Walking pace, m/s: an unhurried stroll to the bar. */
const WALK_MPS = 1.15;
/** How long a customer's goodbye bubble shows before they turn for the door. */
const FAREWELL_S = 1.6;
/** Under this much time left, an order's bubble turns red. */
const URGENT_S = 20;

export type BarGuest = {
  id: string;
  createdAt: string;
  deadlineAt: string;
  dialogue: string;
  troubleType: string | null;
  payload: Record<string, unknown>;
};

export type BarCast = {
  bartender: { id: string; name: string } | null;
  /** The viewer has the apron: they serve with their own avatar, so no stand-in is drawn. */
  mine: boolean;
  guests: BarGuest[];
};

/** Who is at the bar right now, from the public Tavern snapshot. */
export function barCast(snapshot: TavernSnapshot | null, me: string | null = null): BarCast {
  if (!snapshot?.enabled) return { bartender: null, mine: false, guests: [] };
  const shift = snapshot.shift && snapshot.shift.status === "active" ? snapshot.shift : null;
  return {
    bartender: shift ? { id: shift.bartenderId, name: shift.bartenderName } : null,
    mine: Boolean(shift && me && shift.bartenderId === me),
    guests: snapshot.chits
      .filter((c) => c.outcome === "pending")
      .map((c) => ({ id: c.id, createdAt: c.createdAt, deadlineAt: c.deadlineAt, dialogue: c.dialogue, troubleType: c.troubleType, payload: c.payload })),
  };
}

/**
 * Which counter place each guest takes. A guest keeps the place they walked
 * to; a newcomer takes the first free one, so nobody shuffles along when
 * the person next to them leaves. Guests beyond the places wait unseen.
 */
export function assignPlaces(held: ReadonlyMap<string, number>, guests: readonly string[], places: number): Map<string, number> {
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const id of guests) {
    const place = held.get(id);
    if (place !== undefined && place < places && !used.has(place)) {
      out.set(id, place);
      used.add(place);
    }
  }
  for (const id of guests) {
    if (out.has(id)) continue;
    let free = 0;
    while (used.has(free)) free += 1;
    if (free >= places) continue;
    out.set(id, free);
    used.add(free);
  }
  return out;
}

/** A customer waiting at the counter, as the walker's E sees them. */
export type WaitingGuest = { chitId: string; name: string; x: number; z: number; response: { key: string; label: string }; dialogue: string };

type Farewell = "served" | "expired" | "closing";
const FAREWELL_TEXT: Record<Farewell, string> = { served: "🍻 Cheers!", expired: "😤 Forget it", closing: "👋 Night!" };

type Figure = {
  key: string;
  npc: TankNpc;
  holder: THREE.Group;
  sprite: THREE.Sprite;
  map: THREE.Texture;
  /** The strip has loaded and been uploaded. */
  ready: boolean;
  label: THREE.Sprite | null;
  bubble: Bubble | null;
  phase: number;
  guest: BarGuest | null;
  place: number;
  state: "arriving" | "waiting" | "farewell" | "leaving";
  path: Pt[] | null;
  along: number;
  length: number;
  /** When a goodbye bubble turns for the door. */
  leaveAt: number;
  x: number;
  z: number;
};

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

function canvasSprite(width: number, height: number, scale: [number, number], order: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const map = new THREE.CanvasTexture(canvas);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.center.set(0.5, 0);
  sprite.layers.enable(CRISP_LAYER);
  sprite.renderOrder = order;
  return { canvas, map, sprite };
}

function nameLabel(name: string): THREE.Sprite {
  const { canvas, sprite } = canvasSprite(128, 20, [1.0, 0.16], 11);
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
  return sprite;
}

/** A speech bubble over a customer: what they want, and how long they'll wait for it. */
class Bubble {
  readonly sprite: THREE.Sprite;
  private canvas: HTMLCanvasElement;
  private map: THREE.CanvasTexture;
  private drawn = "";

  constructor() {
    const made = canvasSprite(112, 40, [0.78, 0.28], 12);
    this.sprite = made.sprite;
    this.canvas = made.canvas;
    this.map = made.map;
  }

  /** `left` is the share of the wait still to go (0..1), or null for no timer. */
  draw(text: string, left: number | null, urgent: boolean) {
    const key = `${text}|${left === null ? "-" : Math.round(left * 24)}|${urgent}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const { width: w, height: h } = this.canvas;
    ctx.clearRect(0, 0, w, h);
    const edge = urgent ? "#ef4444" : "#fbbf24";
    ctx.fillStyle = "#fffbeb";
    ctx.strokeStyle = edge;
    ctx.lineWidth = 3;
    // The bubble, with a tail pointing down at the speaker.
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(3, 3, w - 6, h - 14, 8);
    else ctx.rect(3, 3, w - 6, h - 14);
    ctx.moveTo(w / 2 - 6, h - 11);
    ctx.lineTo(w / 2, h - 3);
    ctx.lineTo(w / 2 + 6, h - 11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fffbeb";
    ctx.fillRect(w / 2 - 5, h - 13, 10, 3);
    ctx.font = "bold 14px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillStyle = "#1c1917";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, left === null ? (h - 11) / 2 + 1 : (h - 11) / 2 - 1);
    if (left !== null) {
      ctx.fillStyle = "#00000022";
      ctx.fillRect(12, h - 18, w - 24, 3);
      ctx.fillStyle = edge;
      ctx.fillRect(12, h - 18, (w - 24) * Math.max(0, Math.min(1, left)), 3);
    }
    this.map.needsUpdate = true;
  }

  dispose() {
    this.map.dispose();
    this.sprite.material.dispose();
  }
}

export class TavernBar {
  readonly group = new THREE.Group();
  private figures = new Map<string, Figure>();
  private time = 0;
  /** Chits this viewer just served: they leave happy, not in a huff. */
  private served = new Set<string>();
  /** The first cast seen is already in place: nobody walks in for a page that just opened. */
  private seeded = false;
  private entrance: Pt | null = null;
  private routes = new Map<string, Pt[] | null>();
  private cell: [number, number] = [96, 128];

  constructor(
    private spots: { bartender: BarSpot; guests: BarSpot[] },
    private map: HouseMap | null = null,
  ) {
    this.group.name = "Tavern bar";
    this.entrance = map ? houseEntrance(map) : null;
  }

  /** This viewer served that order: its customer says cheers on the way out. */
  markServed(chitId: string) {
    this.served.add(chitId);
    const figure = this.figures.get(`guest:${chitId}`);
    if (figure) this.farewell(figure, "served");
  }

  /** The customers standing at the counter now (not still walking in), for E. */
  waiting(): WaitingGuest[] {
    const out: WaitingGuest[] = [];
    for (const f of this.figures.values()) {
      if (!f.guest || f.state !== "waiting" || !f.ready) continue;
      const response = orderResponse(f.guest);
      if (response) out.push({ chitId: f.guest.id, name: f.npc.name, x: f.x, z: f.z, response, dialogue: f.guest.dialogue });
    }
    return out;
  }

  /** The waiting customer nearest (x, z) within reach, if any. */
  nearestWaiting(x: number, z: number, reach: number): WaitingGuest | null {
    let best: WaitingGuest | null = null;
    let bestDistance = reach;
    for (const guest of this.waiting()) {
      const d = Math.hypot(guest.x - x, guest.z - z);
      if (d <= bestDistance) {
        best = guest;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Put the right people at the bar: newcomers walk in, the gone walk out. */
  set(cast: BarCast, pool: TankNpcPool | null): void {
    const npcs = pool?.npcs ?? [];
    if (!npcs.length) return;
    if (pool) this.cell = pool.cell;
    const instant = !this.seeded;
    this.seeded = true;

    const guests = [...cast.guests].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const faces = castGuests(guests, npcs);
    const held = new Map<string, number>();
    for (const f of this.figures.values()) if (f.guest && (f.state === "arriving" || f.state === "waiting")) held.set(f.guest.id, f.place);
    const places = assignPlaces(held, guests.map((g) => g.id), this.spots.guests.length);

    const wanted = new Map<string, { npc: TankNpc; guest: BarGuest | null; place: number; label: string | null }>();
    for (const guest of guests) {
      const npc = faces.get(guest.id);
      const place = places.get(guest.id);
      if (npc && place !== undefined) wanted.set(`guest:${guest.id}`, { npc, guest, place, label: null });
    }
    if (cast.bartender && !cast.mine) {
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
      wanted.set(`bartender:${cast.bartender.id}`, { npc, guest: null, place: -1, label: cast.bartender.name });
    }

    const now = Date.now();
    for (const [key, figure] of this.figures) {
      if (figure.state === "farewell" || figure.state === "leaving") continue;
      const want = wanted.get(key);
      if (want) {
        // Still here (keeping the face they walked in with, should the cast reshuffle).
        if (want.guest) figure.guest = want.guest;
        continue;
      }
      if (figure.guest) {
        const reason: Farewell = this.served.has(figure.guest.id)
          ? "served"
          : !cast.bartender
            ? "closing"
            : now >= Date.parse(figure.guest.deadlineAt) - 3000
              ? "expired"
              : "served";
        this.farewell(figure, reason);
      } else {
        this.walkOut(figure);
      }
    }
    for (const [key, want] of wanted) {
      if (this.figures.has(key)) continue;
      const spot = want.guest ? this.spots.guests[want.place] : this.spots.bartender;
      this.add(key, want.npc, want.guest, want.place, want.label, spot, instant);
    }
  }

  private add(key: string, npc: TankNpc, guest: BarGuest | null, place: number, labelText: string | null, spot: BarSpot, instant: boolean) {
    const map = stripTexture(npc);
    map.repeat.set(1 / npc.frames, 1);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.5 }));
    const [cw, ch] = this.cell;
    const tall = ch * NPC_PX_METRES;
    sprite.scale.set(cw * NPC_PX_METRES, tall, 1);
    sprite.center.set(0.5, 0);
    sprite.layers.enable(CRISP_LAYER);
    sprite.renderOrder = 9;
    const holder = new THREE.Group();
    holder.add(sprite);
    const label = labelText ? nameLabel(labelText) : null;
    if (label) {
      label.position.y = tall + 0.04;
      holder.add(label);
    }
    const bubble = guest ? new Bubble() : null;
    if (bubble) {
      bubble.sprite.position.y = tall + 0.02;
      bubble.sprite.visible = false;
      holder.add(bubble.sprite);
    }
    holder.visible = false;
    this.group.add(holder);
    const path = instant ? null : this.route(this.entrance, [spot.x, spot.z]);
    const start = path ? path[0] : ([spot.x, spot.z] as Pt);
    const figure: Figure = {
      key,
      npc,
      holder,
      sprite,
      map,
      ready: false,
      label,
      bubble,
      phase: (npcHash(key) % 1000) / 1000,
      guest,
      place,
      state: path ? "arriving" : "waiting",
      path,
      along: 0,
      length: path ? pathLength(path) : 0,
      leaveAt: 0,
      x: start[0],
      z: start[1],
    };
    holder.position.set(figure.x, 0, figure.z);
    this.figures.set(key, figure);
  }

  /** A walkable route, remembered per pair of ends; null when there's no map or no way. */
  private route(from: Pt | null, to: Pt): Pt[] | null {
    if (!from || !this.map) return null;
    const key = `${from[0].toFixed(2)},${from[1].toFixed(2)}>${to[0].toFixed(2)},${to[1].toFixed(2)}`;
    if (!this.routes.has(key)) this.routes.set(key, findPath(this.map, from, to));
    const path = this.routes.get(key) ?? null;
    return path && path.length > 1 ? path : null;
  }

  private farewell(figure: Figure, reason: Farewell) {
    if (figure.state === "farewell" || figure.state === "leaving") return;
    figure.state = "farewell";
    figure.leaveAt = this.time + FAREWELL_S;
    figure.bubble?.draw(FAREWELL_TEXT[reason], null, reason === "expired");
  }

  private walkOut(figure: Figure) {
    const path = this.route([figure.x, figure.z], this.entrance ?? [figure.x, figure.z]);
    if (!path) {
      this.remove(figure.key);
      return;
    }
    figure.state = "leaving";
    figure.path = path;
    figure.along = 0;
    figure.length = pathLength(path);
    if (figure.bubble) figure.bubble.sprite.visible = false;
  }

  update(dt: number, animate: boolean): void {
    this.time += dt;
    const now = Date.now();
    for (const figure of [...this.figures.values()]) {
      if (!figure.ready) {
        if (!loaded(figure.map.image)) continue;
        figure.map.needsUpdate = true;
        figure.holder.visible = true;
        figure.ready = true;
      }
      const { frames, fps } = figure.npc;
      const frame = Math.floor(((animate ? this.time : 0) + figure.phase * 3) * fps) % frames;
      figure.map.offset.x = frame / frames;

      let bob = 0;
      if ((figure.state === "arriving" || figure.state === "leaving") && figure.path) {
        figure.along += dt * WALK_MPS;
        const [x, z] = pointAlong(figure.path, figure.along);
        figure.x = x;
        figure.z = z;
        if (animate) bob = Math.abs(Math.sin((this.time + figure.phase) * 9)) * 0.035;
        if (figure.along >= figure.length) {
          if (figure.state === "leaving") {
            this.remove(figure.key);
            continue;
          }
          figure.state = "waiting";
          figure.path = null;
        }
      } else if (figure.state === "farewell" && this.time >= figure.leaveAt) {
        this.walkOut(figure);
      }
      figure.holder.position.set(figure.x, bob, figure.z);

      if (figure.bubble && figure.guest) {
        if (figure.state === "waiting") {
          const created = Date.parse(figure.guest.createdAt);
          const deadline = Date.parse(figure.guest.deadlineAt);
          const span = Math.max(1, deadline - created);
          const left = (deadline - now) / span;
          figure.bubble.draw(orderBubble(figure.guest), left, deadline - now < URGENT_S * 1000);
          figure.bubble.sprite.visible = true;
        } else if (figure.state === "farewell") {
          figure.bubble.sprite.visible = true;
        } else {
          figure.bubble.sprite.visible = false;
        }
      }
    }
  }

  private remove(key: string) {
    const figure = this.figures.get(key);
    if (!figure) return;
    this.group.remove(figure.holder);
    figure.sprite.material.dispose();
    figure.map.dispose();
    if (figure.label) {
      figure.label.material.map?.dispose();
      figure.label.material.dispose();
    }
    figure.bubble?.dispose();
    if (figure.guest) this.served.delete(figure.guest.id);
    this.figures.delete(key);
  }

  dispose(): void {
    for (const key of [...this.figures.keys()]) this.remove(key);
  }
}
