// Tank's random NPC pool — strangers drawn from the Star-city-drift sprite
// library (artifacts/tank-npcs/build_npcs.py → scripts/tank-npcs-sync.ts).
// Nobody is placed or rigged: each one is an idle loop on a strip, and who
// turns up is pure chance. The Tavern uses them as its customers.

export type TankNpc = {
  id: string;
  name: string;
  frames: number;
  fps: number;
  /** The idle strip: `frames` cells of `cell` side by side. */
  strip: string;
};

export type TankNpcPool = { cell: [number, number]; npcs: TankNpc[] };

const ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function poolBase(): string {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://db.unenter.live";
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/tank-assets/rooms3d/npcs`;
}

export function npcPoolUrl(): string {
  return `${poolBase()}/npcs.json`;
}

/** Validates the published npcs.json; anything malformed is dropped, never trusted. */
export function parseNpcPool(raw: unknown, base = poolBase()): TankNpcPool | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { version?: unknown; cell?: unknown; npcs?: unknown };
  const cell = Array.isArray(r.cell) && r.cell.length === 2 && r.cell.every((n) => Number.isFinite(n) && (n as number) > 0)
    ? ([Number(r.cell[0]), Number(r.cell[1])] as [number, number])
    : null;
  if (!cell || !Array.isArray(r.npcs)) return null;
  const version = typeof r.version === "string" ? r.version.replace(/[^a-z0-9]/gi, "").slice(0, 32) : "";
  const npcs: TankNpc[] = [];
  for (const n of r.npcs as Array<Record<string, unknown>>) {
    if (!n || typeof n.id !== "string" || !ID.test(n.id)) continue;
    const frames = Math.floor(Number(n.frames));
    const fps = Number(n.fps);
    if (!(frames >= 1 && frames <= 64) || !(fps > 0 && fps <= 30)) continue;
    npcs.push({
      id: n.id,
      name: typeof n.name === "string" && n.name.trim() ? n.name.trim().slice(0, 32) : n.id,
      frames,
      fps,
      strip: `${base}/${n.id}.webp${version ? `?v=${version}` : ""}`,
    });
  }
  return npcs.length ? { cell, npcs } : null;
}

let poolPromise: Promise<TankNpcPool | null> | null = null;

/** The pool, fetched once per page; null when it isn't published or fails. */
export function loadNpcPool(): Promise<TankNpcPool | null> {
  if (!poolPromise) {
    poolPromise = fetch(npcPoolUrl(), { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => parseNpcPool(raw))
      .catch(() => null);
    // A failed load may be retried on the next mount.
    void poolPromise.then((pool) => {
      if (!pool) poolPromise = null;
    });
  }
  return poolPromise;
}

/** FNV-1a, so the same key always lands on the same stranger for every viewer. */
export function npcHash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Who each guest is: a random NPC per key (a chit id), the same on every
 * screen. Older guests keep theirs; a newer guest who'd be a twin of someone
 * already at the bar gets the next free stranger instead.
 */
export function castGuests<T extends { id: string; createdAt: string }>(
  guests: T[],
  npcs: TankNpc[],
): Map<string, TankNpc> {
  const cast = new Map<string, TankNpc>();
  if (!npcs.length) return cast;
  const taken = new Set<string>();
  const byArrival = [...guests].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  for (const guest of byArrival) {
    const start = npcHash(guest.id) % npcs.length;
    let pick = npcs[start];
    for (let step = 0; step < npcs.length; step += 1) {
      const candidate = npcs[(start + step) % npcs.length];
      if (!taken.has(candidate.id)) {
        pick = candidate;
        break;
      }
    }
    taken.add(pick.id);
    cast.set(guest.id, pick);
  }
  return cast;
}
