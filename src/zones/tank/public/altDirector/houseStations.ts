// The house's game stations: the kitchen bar (the Tavern, the bartender game)
// and the coffee table in front of the couch (the chat mini-games, see
// tableGames.ts). They are ordinary furniture in the Blender house; the walk
// map knows nothing about games, so this module finds the furniture by name
// in the loaded scene and lays the stations on top of it: where E answers,
// where the bartender and the customers stand, where the table cam hangs.
//
// Plain geometry (no three), so the layout is testable; the boxes are
// measured from the scene before its static meshes are merged away.

import type { HouseHotspot, HouseMap, HouseSeat } from "./houseMap";

export type Box = { min: [number, number, number]; max: [number, number, number] };

export type HouseStations = {
  /** The oval coffee table's top. */
  table: Box;
  /** The kitchen peninsula's worktop: the bar. Customers stand on its low-x (living room) side. */
  bar: Box;
};

/** The furniture each station sits on, by Blender object name ("Coffee table — oval coffee table"). */
export const STATION_NODES: Record<keyof HouseStations, RegExp> = {
  table: /^Coffee table\s*[—–-]\s*oval coffee table$/i,
  bar: /^Peninsula\s*[—–-]\s*worktop$/i,
};

/** Where they were in house v1.0, for a house exported without those names. */
export const DEFAULT_STATIONS: HouseStations = {
  table: { min: [2.18, 0.4, 0.36], max: [3.72, 0.48, 1.54] },
  bar: { min: [4.8, 0.84, -3.46], max: [5.58, 0.92, -2.02] },
};

const centre = (box: Box): [number, number, number] => [
  (box.min[0] + box.max[0]) / 2,
  (box.min[1] + box.max[1]) / 2,
  (box.min[2] + box.max[2]) / 2,
];

export const TABLE_HOTSPOT = "game-table";
export const BAR_HOTSPOT = "tavern-bar";
export const BAR_STAFF_HOTSPOT = "tavern-staff";

export const TABLE_BLURB = "Sit on the sofa or the barrel chair for the table view. Play from chat: /roll, /flip, /slots, /roulette, /unbox.";
export const BAR_BLURB = "The Tavern. Customers order at the bar; whoever has the apron serves them.";

/** E at the bar opens the Tavern; E at the table explains the table. */
export function stationHotspots(stations: HouseStations): HouseHotspot[] {
  const [tx, ty, tz] = centre(stations.table);
  const [, by, bz] = centre(stations.bar);
  const base = { node: null, fx: null } as const;
  return [
    { ...base, id: TABLE_HOTSPOT, label: "Game table", blurb: TABLE_BLURB, effect: "table", at: [tx, ty + 0.4, tz], r: 1.3, room: "living-room" },
    { ...base, id: BAR_HOTSPOT, label: "Tavern", blurb: BAR_BLURB, effect: "tavern", at: [stations.bar.min[0] - 0.55, by, bz], r: 1.25, room: "living-room" },
    { ...base, id: BAR_STAFF_HOTSPOT, label: "Tavern (behind the bar)", blurb: BAR_BLURB, effect: "tavern", at: [stations.bar.max[0] + 0.45, by, bz + 0.25], r: 1.2, room: "kitchen" },
  ];
}

/** The map with the stations' hotspots added (a hotspot of the same id from Blender wins). */
export function withStations(map: HouseMap, stations: HouseStations): HouseMap {
  const own = new Set(map.hotspots.map((h) => h.id));
  return { ...map, hotspots: [...map.hotspots, ...stationHotspots(stations).filter((h) => !own.has(h.id))] };
}

/** Seats close enough to the table to play at it: sitting there switches to the table cam. */
export function tableSeats(seats: readonly HouseSeat[], stations: HouseStations, reach = 2.2): Set<string> {
  const [tx, , tz] = centre(stations.table);
  return new Set(seats.filter((s) => Math.hypot(s.at[0] - tx, s.at[2] - tz) <= reach).map((s) => s.id));
}

export type TableView = {
  /** Where the felt mat lies: centre, and its size in metres (x, z). */
  mat: { at: [number, number, number]; width: number; depth: number };
  /** The table cam: straight down, screen-up pointing away from the couch (-z). */
  eye: [number, number, number];
  target: [number, number, number];
};

/**
 * The mat sits just above the table's tray; the camera hangs 1.45 m above it,
 * below the living room's ceiling fan.
 */
export function tableView(stations: HouseStations): TableView {
  const [tx, , tz] = centre(stations.table);
  const top = stations.table.max[1] + 0.035;
  const width = (stations.table.max[0] - stations.table.min[0]) * 0.86;
  const depth = (stations.table.max[2] - stations.table.min[2]) * 0.86;
  return { mat: { at: [tx, top, tz], width, depth }, eye: [tx, top + 1.45, tz], target: [tx, top, tz] };
}

/** Vertical field of view (degrees) that fits the mat on a screen of this aspect. */
export function tableFov(view: TableView, aspect: number): number {
  const height = view.eye[1] - view.target[1];
  const half = Math.max(view.mat.depth / 2 + 0.12, (view.mat.width / 2 + 0.12) / Math.max(0.2, aspect));
  return (2 * Math.atan(half / height) * 180) / Math.PI;
}

export type BarSpot = { x: number; z: number };

/**
 * Where the people at the bar stand: the bartender behind it on the kitchen
 * side, customers along the living-room side (behind the stools), and a
 * second row when the counter is full.
 */
export function barSpots(stations: HouseStations, perRow = 3, rows = 2): { bartender: BarSpot; guests: BarSpot[] } {
  const { min, max } = stations.bar;
  const [, , cz] = centre(stations.bar);
  const guests: BarSpot[] = [];
  const span = max[2] - min[2];
  for (let row = 0; row < rows; row += 1) {
    for (let i = 0; i < perRow; i += 1) {
      const z = max[2] - span * ((i + 0.5) / perRow) + (row % 2 ? span / (perRow * 2) : 0);
      guests.push({ x: min[0] - 0.62 - row * 0.55, z });
    }
  }
  return { bartender: { x: max[0] + 0.42, z: cz + 0.3 }, guests };
}
