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
};

export type HouseMap = {
  radius: number;
  blockerRadius: number;
  spawn: [number, number, number];
  floors: HouseFloor[];
  walls: Rect[];
  blockers: Rect[];
  hotspots: HouseHotspot[];
};

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
    });
  }

  const spawn = Array.isArray(m.spawn) && m.spawn.length === 3 && m.spawn.every(finite) ? (m.spawn as number[]) : null;
  const centre = floors[0].rect;
  return {
    radius: finite(m.radius) ? Math.min(Math.max(m.radius, 0.05), 0.6) : 0.2,
    blockerRadius: finite(m.blockerRadius) ? Math.min(Math.max(m.blockerRadius, 0), 0.6) : 0.1,
    spawn: spawn
      ? [spawn[0], spawn[1], spawn[2]]
      : [(centre[0] + centre[2]) / 2, (centre[1] + centre[3]) / 2, 0],
    floors,
    walls: rects(m.walls),
    blockers: rects(m.blockers),
    hotspots,
  };
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

/**
 * Move by (dx, dz), sliding along whatever is in the way. Sub-stepped so a
 * fast frame can never tunnel through a 4 cm wall, and axis-separated so
 * walking diagonally into a wall glides along it instead of sticking.
 */
export function moveWithCollision(map: HouseMap, x: number, z: number, dx: number, dz: number): [number, number] {
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return [x, z];
  const steps = Math.max(1, Math.ceil(distance / 0.02));
  const sx = dx / steps;
  const sz = dz / steps;
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
    }
  }
  return [px, pz];
}

/** The closest hotspot within reach, if any. */
export function nearestHotspot(map: HouseMap, x: number, z: number): HouseHotspot | null {
  let best: HouseHotspot | null = null;
  let bestDistance = Infinity;
  for (const spot of map.hotspots) {
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
