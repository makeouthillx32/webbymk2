// src/zones/tank/vision/houseCast.ts
// ─────────────────────────────────────────────────────────────────────────────
// The house cast mirrors the real house.
//
// Every real camera already emits detection boxes (and, for enrolled people,
// a name). Each room's camera is fitted into the Blender house
// (fisheyeFloor.ts), so the bottom-centre of a box, where the feet touch the
// floor, lands on a point of the house floor. This turns one tick of boxes
// into where each cast member stands, so the alt director's sprites walk where
// the people (and pets) really are.
//
// Pure: no I/O, no clocks. The server runs it once a second and broadcasts the
// result as `house_cast` on tank:director:state. The client only animates.
//
// Who becomes whom:
//   - a named person (the identity layer's targetName) drives that member's rig;
//   - unnamed people drive nothing yet (no stand-in sprite);
//   - dogs and cats have no identities, so each detected animal takes the
//     nearest free slot of its kind and keeps it while it stays continuous.
//
// Positions are house metres (Blender world, Z up). toThreeFloor() converts.
// ─────────────────────────────────────────────────────────────────────────────

import { imageToFloor, type RoomCameraFit } from "./fisheyeFloor";

export type CastKind = "human" | "dog" | "cat";

/** Cast ids and the rig each one drives in cast.glb (a ".001" suffix is fine). */
export const CAST_RIGS: Record<string, { kind: CastKind; rig: string }> = {
  joe: { kind: "human", rig: "Joe_Rig" },
  malia: { kind: "human", rig: "Malia_Rig" },
  tyler: { kind: "human", rig: "Pixel_Tyler_Rig" },
  oly: { kind: "human", rig: "Oly_Rig" },
  molly: { kind: "human", rig: "Molly_Rig" },
  james: { kind: "human", rig: "James_Rig" },
  kitty: { kind: "human", rig: "Kitty_Rig" },
  "golden-dog": { kind: "dog", rig: "GoldenDog_Rig" },
  "brindle-dog": { kind: "dog", rig: "BrindleDog_Rig" },
  "black-cat": { kind: "cat", rig: "BlackCat_Rig" },
  "orange-cat": { kind: "cat", rig: "OrangeCat_Rig" },
};

const ANIMAL_SLOTS: Record<"dog" | "cat", string[]> = {
  dog: ["golden-dog", "brindle-dog"],
  cat: ["black-cat", "orange-cat"],
};

/** Enrolled names that differ from the cast id. */
const NAME_ALIASES: Record<string, string> = { olly: "oly", ollie: "oly" };

export function castIdForName(name: string | null | undefined): string | null {
  const key = name?.trim().toLowerCase().replace(/^@/, "");
  if (!key) return null;
  const id = NAME_ALIASES[key] ?? key;
  return CAST_RIGS[id]?.kind === "human" ? id : null;
}

export type CastMember = {
  id: string;
  kind: CastKind;
  /** House floor, metres (Blender X, Y). */
  x: number;
  y: number;
  /** Which way it is walking, radians in the house floor plane (atan2(dy, dx)); null when unknown. */
  heading: number | null;
  moving: boolean;
  /** The room whose camera saw it last. */
  room: string;
  seenAt: number;
};

export type HouseCastState = { updatedAt: number; members: CastMember[] };

export type CastBox = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  label: string;
  confidence?: number;
  targetName?: string;
};

export type CastReading = { cameraId: string; boundingBoxes?: CastBox[] };

/** A member nobody has seen for this long leaves the house (its rig goes back to its mark). */
export const CAST_TTL_MS = 6000;
/** Faster than this (m/s) counts as walking. */
export const MOVING_SPEED = 0.25;
/** Two sightings of one animal kind closer than this are the same animal (two cameras, one cat). */
const SAME_ANIMAL_M = 0.9;
/** How far an animal may plausibly get between ticks and still keep its slot. */
const ANIMAL_REACH_M = 4;
/** New sightings pull the mirrored position this much per tick (smooths detector jitter). */
const FOLLOW = 0.6;
const MIN_CONFIDENCE = 0.35;

type Sighting = { x: number; y: number; room: string; weight: number };

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function footOf(box: CastBox): { x: number; y: number } | null {
  if (![box.nx, box.ny, box.nw, box.nh].every(Number.isFinite) || box.nw <= 0 || box.nh <= 0) return null;
  return { x: box.nx + box.nw / 2, y: Math.min(0.999, box.ny + box.nh) };
}

/** Confidence-weighted mean of every sighting of one member. */
function merge(list: Sighting[]): Sighting {
  const total = list.reduce((sum, s) => sum + s.weight, 0) || 1;
  const best = list.reduce((a, b) => (b.weight > a.weight ? b : a));
  return {
    x: list.reduce((sum, s) => sum + s.x * s.weight, 0) / total,
    y: list.reduce((sum, s) => sum + s.y * s.weight, 0) / total,
    room: best.room,
    weight: best.weight,
  };
}

/**
 * One tick: readings + where each camera hangs -> the cast.
 *
 * @param cameraRooms camera id -> room key (off-air rooms included: the house
 *                    mirrors every room, on air for Tank or not).
 * @param fits        room key -> that room camera's fit.
 * @param previous    last tick's members (continuity, smoothing, TTL).
 */
export function computeHouseCast(input: {
  readings: readonly CastReading[];
  cameraRooms: ReadonlyMap<string, string>;
  fits: Readonly<Record<string, RoomCameraFit>>;
  previous: readonly CastMember[];
  now: number;
}): CastMember[] {
  const { readings, cameraRooms, fits, previous, now } = input;
  const named = new Map<string, Sighting[]>();
  const animals: Record<"dog" | "cat", Sighting[]> = { dog: [], cat: [] };

  for (const reading of readings) {
    const room = cameraRooms.get(reading.cameraId);
    const fit = room ? fits[room] : undefined;
    if (!room || !fit) continue;
    for (const box of reading.boundingBoxes ?? []) {
      const confidence = box.confidence ?? 0.6;
      if (confidence < MIN_CONFIDENCE) continue;
      const label = box.label.toLowerCase();
      const isAnimal = label === "dog" || label === "cat";
      const id = label === "person" ? castIdForName(box.targetName) : null;
      if (!id && !isAnimal) continue;
      const foot = footOf(box);
      const floor = foot ? imageToFloor(fit, foot) : null;
      if (!floor) continue;
      const sighting = { ...floor, room, weight: confidence };
      if (id) named.set(id, [...(named.get(id) ?? []), sighting]);
      else animals[label as "dog" | "cat"].push(sighting);
    }
  }

  const seen = new Map<string, Sighting>();
  for (const [id, list] of named) seen.set(id, merge(list));

  // Animals: collapse duplicate sightings, then keep each slot on the animal
  // nearest where it was; new animals fill the free slots in order.
  const prevById = new Map(previous.map((m) => [m.id, m]));
  for (const kind of ["dog", "cat"] as const) {
    const groups: Sighting[][] = [];
    for (const s of [...animals[kind]].sort((a, b) => b.weight - a.weight)) {
      const group = groups.find((g) => dist(g[0], s) < SAME_ANIMAL_M);
      if (group) group.push(s);
      else groups.push([s]);
    }
    const found = groups.map(merge);
    const slots = ANIMAL_SLOTS[kind];
    const pairs: Array<{ slot: string; index: number; d: number }> = [];
    for (const slot of slots) {
      const prev = prevById.get(slot);
      if (!prev) continue;
      found.forEach((s, index) => {
        const d = dist(prev, s);
        if (d <= ANIMAL_REACH_M) pairs.push({ slot, index, d });
      });
    }
    pairs.sort((a, b) => a.d - b.d);
    const taken = new Set<number>();
    for (const { slot, index } of pairs) {
      if (seen.has(slot) || taken.has(index)) continue;
      seen.set(slot, found[index]);
      taken.add(index);
    }
    found.forEach((s, index) => {
      if (taken.has(index)) return;
      const slot = slots.find((id) => !seen.has(id) && !prevById.has(id));
      if (!slot) return;
      seen.set(slot, s);
      taken.add(index);
    });
  }

  const out: CastMember[] = [];
  for (const [id, s] of seen) {
    const prev = prevById.get(id);
    const x = prev ? prev.x + (s.x - prev.x) * FOLLOW : s.x;
    const y = prev ? prev.y + (s.y - prev.y) * FOLLOW : s.y;
    const dt = prev ? Math.max(0.2, (now - prev.seenAt) / 1000) : 1;
    const moved = prev ? Math.hypot(x - prev.x, y - prev.y) : 0;
    const moving = moved / dt > MOVING_SPEED;
    out.push({
      id,
      kind: CAST_RIGS[id].kind,
      x: Number(x.toFixed(3)),
      y: Number(y.toFixed(3)),
      heading: moving && prev ? Number(Math.atan2(y - prev.y, x - prev.x).toFixed(3)) : prev?.heading ?? null,
      moving,
      room: s.room,
      seenAt: now,
    });
  }
  // Not seen this tick but not gone yet: hold still where it was last seen.
  for (const prev of previous) {
    if (seen.has(prev.id) || now - prev.seenAt > CAST_TTL_MS) continue;
    out.push({ ...prev, moving: false });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Whether a broadcast is worth sending: someone arrived, left, started/stopped, or moved a bit. */
export function houseCastChanged(a: readonly CastMember[], b: readonly CastMember[]): boolean {
  if (a.length !== b.length) return true;
  const byId = new Map(a.map((m) => [m.id, m]));
  return b.some((m) => {
    const p = byId.get(m.id);
    return !p || p.moving !== m.moving || p.room !== m.room || dist(p, m) > 0.05;
  });
}

/** Camera id -> room key, from a camera directory (on-air and off-air rooms both). */
export function cameraRoomMap(
  rooms: ReadonlyArray<{ roomKey: string; cameraIds: readonly string[] }>,
  cameras: ReadonlyArray<{ id: string; roomScope?: string | null }> = [],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const camera of cameras) if (camera.roomScope) map.set(camera.id, camera.roomScope);
  for (const room of rooms) for (const id of room.cameraIds) map.set(id, room.roomKey);
  return map;
}

/** A broadcast payload from the wire, defensively. */
export function parseHouseCast(raw: unknown): HouseCastState | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { updatedAt?: unknown; members?: unknown };
  if (!Array.isArray(r.members)) return null;
  const members = r.members.filter(
    (m): m is CastMember =>
      Boolean(m) &&
      typeof m.id === "string" &&
      Boolean(CAST_RIGS[m.id]) &&
      Number.isFinite(m.x) &&
      Number.isFinite(m.y),
  );
  return { updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : Date.now(), members };
}
