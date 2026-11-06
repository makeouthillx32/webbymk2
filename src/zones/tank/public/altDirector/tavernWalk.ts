// How the Tavern's customers get to the bar: they come in at the front door
// and walk the house's own walk map (the same floors, walls and furniture
// the visitor collides with) to their place at the counter, then walk back
// out when they've been served. A grid A* over canStand, pulled tight into
// a few straight legs so they cut corners like people, not like a grid.
//
// Plain geometry (no three), so the paths are testable.

import { canStand, type HouseMap } from "./houseMap";

export type Pt = [number, number];

/** Grid cell for the search, metres. */
export const PATH_CELL = 0.12;

/** Is the straight ground line a→b walkable all the way? */
export function clearLine(map: HouseMap, a: Pt, b: Pt, step = 0.06): boolean {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    if (!canStand(map, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

/** The closest point you can stand on, within reach of (x, z); the point itself if it's fine. */
export function nearestStandable(map: HouseMap, x: number, z: number, reach = 1.5, cell = PATH_CELL / 2): Pt | null {
  if (canStand(map, x, z)) return [x, z];
  for (let r = cell; r <= reach + 1e-9; r += cell) {
    const steps = Math.max(8, Math.ceil((2 * Math.PI * r) / cell));
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (canStand(map, px, pz)) return [px, pz];
    }
  }
  return null;
}

/** A binary min-heap of cell indices keyed by f-score. */
class Heap {
  private items: number[] = [];
  constructor(private score: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(i: number) {
    const a = this.items;
    a.push(i);
    let c = a.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.score[a[p]] <= this.score[a[c]]) break;
      [a[p], a[c]] = [a[c], a[p]];
      c = p;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < a.length && this.score[a[l]] < this.score[a[m]]) m = l;
        if (r < a.length && this.score[a[r]] < this.score[a[m]]) m = r;
        if (m === p) break;
        [a[p], a[m]] = [a[m], a[p]];
        p = m;
      }
    }
    return top;
  }
}

/**
 * A walkable path from → to, as a few straight legs. Both ends are snapped
 * to the nearest standable point first; when `to` itself isn't standable
 * (a place tucked against the bar) the path ends with a short last step
 * onto it. Null when there is no way there.
 */
export function findPath(map: HouseMap, from: Pt, to: Pt, cell = PATH_CELL): Pt[] | null {
  const start = nearestStandable(map, from[0], from[1]);
  const goal = nearestStandable(map, to[0], to[1]);
  if (!start || !goal) return null;
  const finish = (path: Pt[]): Pt[] => {
    const end = path[path.length - 1];
    if (Math.hypot(end[0] - to[0], end[1] - to[1]) > 1e-6) path.push([to[0], to[1]]);
    return path;
  };
  if (clearLine(map, start, goal)) return finish([start, goal]);

  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const f of map.floors) {
    x0 = Math.min(x0, f.rect[0]);
    z0 = Math.min(z0, f.rect[1]);
    x1 = Math.max(x1, f.rect[2]);
    z1 = Math.max(z1, f.rect[3]);
  }
  const cols = Math.ceil((x1 - x0) / cell) + 1;
  const rows = Math.ceil((z1 - z0) / cell) + 1;
  const total = cols * rows;
  // -1 unknown, 0 blocked, 1 open; worked out only for the cells the search touches.
  const open = new Int8Array(total).fill(-1);
  const at = (i: number): Pt => [x0 + (i % cols) * cell, z0 + Math.floor(i / cols) * cell];
  const cellOf = (p: Pt) =>
    Math.min(rows - 1, Math.max(0, Math.round((p[1] - z0) / cell))) * cols + Math.min(cols - 1, Math.max(0, Math.round((p[0] - x0) / cell)));
  const walkable = (i: number) => {
    if (open[i] < 0) {
      const [x, z] = at(i);
      open[i] = canStand(map, x, z) ? 1 : 0;
    }
    return open[i] === 1;
  };

  const s = cellOf(start);
  const g = cellOf(goal);
  const gScore = new Float64Array(total).fill(Infinity);
  const fScore = new Float64Array(total).fill(Infinity);
  const came = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const [gx, gz] = at(g);
  const h = (i: number) => {
    const [x, z] = at(i);
    const dx = Math.abs(x - gx);
    const dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  gScore[s] = 0;
  fScore[s] = h(s);
  const heap = new Heap(fScore);
  heap.push(s);
  let found = false;
  while (heap.size) {
    const c = heap.pop();
    if (closed[c]) continue;
    if (c === g) {
      found = true;
      break;
    }
    closed[c] = 1;
    const cx = c % cols;
    const cz = Math.floor(c / cols);
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dz) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const n = nz * cols + nx;
        if (closed[n] || (n !== g && !walkable(n))) continue;
        // No squeezing diagonally between two blocked cells.
        if (dx && dz && (!walkable(cz * cols + nx) || !walkable(nz * cols + cx))) continue;
        const tentative = gScore[c] + (dx && dz ? Math.SQRT2 : 1) * cell;
        if (tentative >= gScore[n]) continue;
        came[n] = c;
        gScore[n] = tentative;
        fScore[n] = tentative + h(n);
        heap.push(n);
      }
    }
  }
  if (!found) return null;

  const cells: Pt[] = [];
  for (let c = g; c !== -1; c = came[c]) cells.push(at(c));
  cells.reverse();
  cells[0] = start;
  cells[cells.length - 1] = goal;

  // Pull the grid path tight: from each corner, the furthest point in plain sight.
  const legs: Pt[] = [cells[0]];
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !clearLine(map, cells[i], cells[j])) j -= 1;
    legs.push(cells[j]);
    i = j;
  }
  return finish(legs);
}

/** How long a path is, metres. */
export function pathLength(path: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return total;
}

/** Where you are `distance` metres along the path (clamped to its ends). */
export function pointAlong(path: readonly Pt[], distance: number): Pt {
  let left = Math.max(0, distance);
  for (let i = 1; i < path.length; i += 1) {
    const [ax, az] = path[i - 1];
    const [bx, bz] = path[i];
    const leg = Math.hypot(bx - ax, bz - az);
    if (left <= leg) {
      const t = leg > 0 ? left / leg : 1;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    left -= leg;
  }
  return path[path.length - 1] ?? [0, 0];
}

/** The house's way in: just inside the front door, else where visitors spawn. */
export function houseEntrance(map: HouseMap): Pt {
  const door = map.hotspots.find((h) => h.id === "front-door");
  if (door) {
    const inside = nearestStandable(map, door.at[0], door.at[2], 2);
    if (inside) return inside;
  }
  return [map.spawn[0], map.spawn[2]];
}
