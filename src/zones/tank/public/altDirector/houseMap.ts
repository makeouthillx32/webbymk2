// The alt director's walk map: what a visitor can stand on, bump into and
// walk up to while every room is off air.
//
// The map is exported from the Blender house by the Tank Rooms panel
// ("Export walkable house") and travels inside house.glb as extras on the
// "TANK HOUSE MAP" node, so scene and collisions can never drift apart.
// Coordinates are three.js ground-plane metres (x, z); rects are
// [minX, minZ, maxX, maxZ]. Nothing here imports three — it is plain geometry,
// kept separate so the rules are testable without a GPU.

export type Rect = [number, number, number, number];

export type HouseFloor = { label: string; room: string | null; rect: Rect };

export type HouseHotspot = {
  id: string;
  label: string;
  blurb: string;
  effect: "tv" | null;
  at: [number, number, number];
  r: number;
  node: string | null;
  /** A pixelfx effect id ("pickups/sparkle") to play when it's used, if any. */
  fx: string | null;
  /**
   * The room it belongs to (areaOf its floor). It only answers a walker
   * standing in that room: the TV must not light up from the foyer through
   * the wall. Null when it stands on no floor at all; then reach alone decides.
   */
  room: string | null;
};

/** An FX anchor placed in Blender: where a pixelfx effect plays. */
export type HouseFx = {
  id: string;
  effect: string;
  at: [number, number, number];
  loop: boolean;
  /** Height of the effect's card in metres. */
  size: number;
  palette: string | null;
};

export type HouseAvatar = { id: string; node: string };

export type HouseMap = {
  radius: number;
  blockerRadius: number;
  spawn: [number, number, number];
  floors: HouseFloor[];
  walls: Rect[];
  blockers: Rect[];
  hotspots: HouseHotspot[];
  fx: HouseFx[];
  avatars: HouseAvatar[];
};

// Effect ids are pixelfx paths: "fire/torch", "pickups/coin-sparkle".
const FX_ID = /^[a-z0-9-]+\/[a-z0-9-]+$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function rect(value: unknown): Rect | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(finite)) return null;
  const [x0, z0, x1, z1] = value as number[];
  return x1 > x0 && z1 > z0 ? [x0, z0, x1, z1] : null;
}

function rects(value: unknown): Rect[] {
  return Array.isArray(value) ? value.map(rect).filter((r): r is Rect => r !== null) : [];
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/**
 * Accept a map only in the shape we expect. The JSON comes from our own
 * export, but it is read off a public bucket — anything malformed is dropped
 * rather than trusted, and a map with no floor is no map at all.
 */
export function parseHouseMap(raw: unknown): HouseMap | null {
  let source = raw;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      return null;
    }
  }
  if (!source || typeof source !== "object") return null;
  const m = source as Record<string, unknown>;

  const floors: HouseFloor[] = [];
  for (const f of Array.isArray(m.floors) ? m.floors : []) {
    const r = rect((f as { rect?: unknown })?.rect);
    const label = text((f as { label?: unknown })?.label, 40);
    if (!r || !label) continue;
    const room = text((f as { room?: unknown }).room, 64);
    floors.push({ label, room: room && /^[a-z0-9][a-z0-9-]*$/.test(room) ? room : null, rect: r });
  }
  if (!floors.length) return null;

  const hotspots: HouseHotspot[] = [];
  const AREA = /^[a-z0-9][a-z0-9-]*$/;
  for (const h of Array.isArray(m.hotspots) ? m.hotspots : []) {
    const spot = h as Record<string, unknown>;
    const id = text(spot?.id, 40);
    const label = text(spot?.label, 40);
    const blurb = text(spot?.blurb, 200);
    const at = spot?.at;
    if (!id || !label || !blurb || !Array.isArray(at) || at.length !== 3 || !at.every(finite) || !finite(spot.r)) continue;
    hotspots.push({
      id,
      label,
      blurb,
      effect: spot.effect === "tv" ? "tv" : null,
      at: [at[0], at[1], at[2]],
      r: Math.min(Math.max(spot.r, 0.3), 4),
      node: text(spot.node, 120),
      fx: typeof spot.fx === "string" && FX_ID.test(spot.fx) ? spot.fx : null,
      room: typeof spot.room === "string" && AREA.test(spot.room) ? spot.room : roomOfPoint(floors, at[0], at[2]),
    });
  }

  const fx: HouseFx[] = [];
  for (const f of Array.isArray(m.fx) ? m.fx : []) {
    const anchor = f as Record<string, unknown>;
    const at = anchor?.at;
    if (typeof anchor?.effect !== "string" || !FX_ID.test(anchor.effect)) continue;
    if (!Array.isArray(at) || at.length !== 3 || !at.every(finite)) continue;
    const palette = text(anchor.palette, 200);
    fx.push({
      id: text(anchor.id, 40) ?? anchor.effect,
      effect: anchor.effect,
      at: [at[0], at[1], at[2]],
      loop: anchor.loop !== false,
      size: finite(anchor.size) ? Math.min(Math.max(anchor.size, 0.1), 6) : 1,
      palette,
    });
  }

  const avatars: HouseAvatar[] = [];
  for (const a of Array.isArray(m.avatars) ? m.avatars : []) {
    const id = (a as { id?: unknown })?.id;
    const node = text((a as { node?: unknown })?.node, 120);
    if (typeof id === "string" && SLUG.test(id) && node) avatars.push({ id, node });
  }

  const spawn = Array.isArray(m.spawn) && m.spawn.length === 3 && m.spawn.every(finite) ? (m.spawn as number[]) : null;
  const centre = floors[0].rect;
  return {
    radius: finite(m.radius) ? Math.min(Math.max(m.radius, 0.05), 0.6) : 0.2,
    blockerRadius: finite(m.blockerRadius) ? Math.min(Math.max(m.blockerRadius, 0), 0.6) : 0.1,
    spawn: spawn
      ? [spawn[0], spawn[1], spawn[2]]
      : [(centre[0] + centre[2]) / 2, (centre[1] + centre[3]) / 2, 0],
    floors: [...floors, ...floorSeams(floors)],
    walls: rects(m.walls),
    blockers: rects(m.blockers),
    hotspots,
    fx,
    avatars,
  };
}

/** Floor meshes this far apart are one floor split by a wall line, not two rooms with a void between. */
export const FLOOR_SEAM_MAX = 0.3;
/** ...as long as they face each other along at least this much edge. */
const FLOOR_SEAM_MIN_OVERLAP = 0.4;

/**
 * Strips of floor bridging the seams between neighbouring floor meshes.
 *
 * The house's floors are cut at the wall lines, and the cuts drift as the
 * house is edited: on 2026-11-04 the makeup room's floor stopped 7 cm short
 * of the entry hall's, so the doorway had a wall gap but no floor under it and
 * the room could not be entered (the export's 10 cm reachability check
 * stepped right over the strip; the browser walks in 2 cm steps). Bridging
 * every thin seam makes the WALLS the only thing that decides where you can
 * cross, which is what they are for: a seam with a wall on it stays shut.
 */
export function floorSeams(floors: readonly HouseFloor[]): HouseFloor[] {
  const seams: HouseFloor[] = [];
  for (let i = 0; i < floors.length; i += 1) {
    for (let j = 0; j < floors.length; j += 1) {
      if (i === j) continue;
      const a = floors[i].rect;
      const b = floors[j].rect;
      // b lies to the +x of a, or to the +z of a (each pair is seen both ways,
      // so checking only the positive side never doubles a seam).
      const gapX = b[0] - a[2];
      const overlapZ = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (gapX > 0 && gapX <= FLOOR_SEAM_MAX && overlapZ >= FLOOR_SEAM_MIN_OVERLAP) {
        seams.push({ label: floors[i].label, room: floors[i].room, rect: [a[2] - 0.01, Math.max(a[1], b[1]), b[0] + 0.01, Math.min(a[3], b[3])] });
      }
      const gapZ = b[1] - a[3];
      const overlapX = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
      if (gapZ > 0 && gapZ <= FLOOR_SEAM_MAX && overlapX >= FLOOR_SEAM_MIN_OVERLAP) {
        seams.push({ label: floors[i].label, room: floors[i].room, rect: [Math.max(a[0], b[0]), a[3] - 0.01, Math.min(a[2], b[2]), b[1] + 0.01] });
      }
    }
  }
  return seams;
}

/** A floor's room: its camera room key, else its own label ("Entry hall"). */
export const areaOf = (floor: HouseFloor): string => floor.room ?? floor.label;

/** Furniture against a wall can sit just off its floor: it still belongs to the floor this close. */
const ROOM_SNAP_M = 0.35;

/** The room a piece of furniture at (x, z) belongs to: the floor under it, else the nearest one within ROOM_SNAP_M. */
function roomOfPoint(floors: readonly HouseFloor[], x: number, z: number): string | null {
  let best: HouseFloor | null = null;
  let bestDistance = Infinity;
  for (const f of floors) {
    const [x0, z0, x1, z1] = f.rect;
    const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
    if (d < bestDistance) {
      best = f;
      bestDistance = d;
    }
  }
  return best && bestDistance <= ROOM_SNAP_M ? areaOf(best) : null;
}

const inside = (r: Rect, x: number, z: number, pad = 0) =>
  x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;

/** The floor under a point (first match wins; floors do not overlap). */
export function floorAt(map: HouseMap, x: number, z: number): HouseFloor | null {
  return map.floors.find((f) => inside(f.rect, x, z, 0.02)) ?? null;
}

/** On a floor, clear of every wall (at body radius) and piece of furniture. */
export function canStand(map: HouseMap, x: number, z: number): boolean {
  if (!floorAt(map, x, z)) return false;
  if (map.walls.some((w) => inside(w, x, z, map.radius))) return false;
  return !map.blockers.some((b) => inside(b, x, z, map.blockerRadius));
}

/** How far the walker is nudged sideways to slip through a doorway it clips. */
export const CORNER_SLIP = 0.3;

/**
 * Find a sideways nudge (along the other axis, up to CORNER_SLIP) that lets a
 * blocked step along one axis go through: the nearest offset where the step
 * is clear and the sidestep to it is too. Returns the signed offset, or null.
 */
function slipOffset(map: HouseMap, x: number, z: number, sx: number, sz: number): number | null {
  const alongX = sx !== 0;
  for (let k = 1; k * 0.02 <= CORNER_SLIP + 1e-9; k += 1) {
    for (const sign of [1, -1]) {
      const off = sign * k * 0.02;
      const ox = alongX ? x : x + off;
      const oz = alongX ? z + off : z;
      if (!canStand(map, ox + sx, oz + sz)) continue;
      // The sidestep itself must be walkable all the way.
      let clear = true;
      for (let j = 1; j <= k && clear; j += 1) {
        const t = (sign * j * 0.02);
        clear = canStand(map, alongX ? x : x + t, alongX ? z + t : z);
      }
      if (clear) return off;
    }
  }
  return null;
}

/**
 * Move by (dx, dz), sliding along whatever is in the way. Sub-stepped so a
 * fast frame can never tunnel through a 4 cm wall, and axis-separated so
 * walking diagonally into a wall glides along it instead of sticking.
 *
 * Corner correction, as platformers do it: walking straight at a wall just
 * beside a doorway nudges the walker sideways into the opening (up to
 * CORNER_SLIP), so a door doesn't need pixel-perfect lining up.
 */
export function moveWithCollision(map: HouseMap, x: number, z: number, dx: number, dz: number): [number, number] {
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return [x, z];
  const steps = Math.max(1, Math.ceil(distance / 0.02));
  const sx = dx / steps;
  const sz = dz / steps;
  const slip = Math.hypot(sx, sz); // a nudge is never faster than the walk
  let px = x;
  let pz = z;
  for (let i = 0; i < steps; i += 1) {
    if (canStand(map, px + sx, pz + sz)) {
      px += sx;
      pz += sz;
    } else if (sx !== 0 && canStand(map, px + sx, pz)) {
      px += sx;
    } else if (sz !== 0 && canStand(map, px, pz + sz)) {
      pz += sz;
    } else {
      // Fully blocked: nudge towards an opening along the main direction.
      const mainX = Math.abs(sx) >= Math.abs(sz);
      const off = mainX ? slipOffset(map, px, pz, sx, 0) : slipOffset(map, px, pz, 0, sz);
      if (off === null) continue;
      const nudge = Math.sign(off) * Math.min(Math.abs(off), slip);
      if (mainX && canStand(map, px, pz + nudge)) pz += nudge;
      else if (!mainX && canStand(map, px + nudge, pz)) px += nudge;
    }
  }
  return [px, pz];
}

/** The closest hotspot within reach in the room the walker stands in, if any. */
export function nearestHotspot(map: HouseMap, x: number, z: number): HouseHotspot | null {
  const floor = floorAt(map, x, z);
  const here = floor ? areaOf(floor) : null;
  let best: HouseHotspot | null = null;
  let bestDistance = Infinity;
  for (const spot of map.hotspots) {
    if (here && spot.room && spot.room !== here) continue;
    const d = Math.hypot(spot.at[0] - x, spot.at[2] - z);
    if (d <= spot.r && d < bestDistance) {
      best = spot;
      bestDistance = d;
    }
  }
  return best;
}

/** Does the ground segment a→b cross any wall? (slab test per rect) */
export function segmentHitsWall(walls: readonly Rect[], ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  for (const w of walls) {
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    for (const [origin, delta, lo, hi] of [
      [ax, dx, w[0], w[2]],
      [az, dz, w[1], w[3]],
    ] as const) {
      if (Math.abs(delta) < 1e-9) {
        if (origin <= lo || origin >= hi) {
          hit = false;
          break;
        }
        continue;
      }
      let ta = (lo - origin) / delta;
      let tb = (hi - origin) / delta;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) {
        hit = false;
        break;
      }
    }
    if (hit) return true;
  }
  return false;
}
