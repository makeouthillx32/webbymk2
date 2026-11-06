import { describe, expect, test } from "bun:test";
import { nearestHotspot, parseHouseMap, type HouseMap } from "./houseMap";
import { BAR_HOTSPOT, BAR_STAFF_HOTSPOT, DEFAULT_STATIONS, STATION_NODES, TABLE_HOTSPOT, barSpots, tableFov, tableSeats, tableView, withStations } from "./houseStations";
import { barCast } from "./tavernBar";
import type { TavernSnapshot } from "../../tavernTypes";

// The v1.0 living room, kitchen and their seats.
const MAP = parseHouseMap({
  radius: 0.25,
  blockerRadius: 0.2,
  spawn: [1, 0, 0],
  floors: [
    { label: "Living room", room: "living-room", rect: [0.02, -3.46, 4.82, 3.48] },
    { label: "Kitchen", room: "kitchen", rect: [4.78, -3.52, 10.06, -1.72] },
  ],
  walls: [],
  blockers: [],
  hotspots: [],
  seats: [
    { id: "seat-sectional-sofa-1", label: "Sofa", at: [2.99, 0.65, 2.85], yaw: 3.1 },
    { id: "seat-sectional-sofa-4", label: "Sofa", at: [4.2, 0.65, 1.77], yaw: 3.1 },
    { id: "seat-barrel-chair-1", label: "Barrel chair", at: [2.5, 0.45, 0.15], yaw: 0 },
    { id: "seat-pink-chair-1", label: "Pink chair", at: [-3.85, 0.08, -1.41], yaw: 0 },
  ],
}) as HouseMap;

describe("house stations", () => {
  test("the furniture names match the v1.0 export", () => {
    expect(STATION_NODES.table.test("Coffee table — oval coffee table")).toBe(true);
    expect(STATION_NODES.bar.test("Peninsula — worktop")).toBe(true);
    expect(STATION_NODES.bar.test("Peninsula — peninsula")).toBe(false);
  });

  test("E answers at the table and on both sides of the bar, each in its own room", () => {
    const map = withStations(MAP, DEFAULT_STATIONS);
    expect(nearestHotspot(map, 2.95, 0.95)?.id).toBe(TABLE_HOTSPOT);
    expect(nearestHotspot(map, 4.3, -2.7)?.id).toBe(BAR_HOTSPOT);
    expect(nearestHotspot(map, 6.0, -2.4)?.id).toBe(BAR_STAFF_HOTSPOT);
    expect(map.hotspots.find((h) => h.id === BAR_HOTSPOT)?.effect).toBe("tavern");
  });

  test("a Blender hotspot of the same id wins", () => {
    const own = { ...MAP, hotspots: [{ id: TABLE_HOTSPOT, label: "Mine", blurb: "b", effect: null, at: [0, 0, 0] as [number, number, number], r: 1, node: null, fx: null, room: null }] };
    expect(withStations(own, DEFAULT_STATIONS).hotspots.filter((h) => h.id === TABLE_HOTSPOT).map((h) => h.label)).toEqual(["Mine"]);
  });

  test("the sofa and the barrel chair are at the table; the makeup chair isn't", () => {
    expect([...tableSeats(MAP.seats, DEFAULT_STATIONS)].sort()).toEqual(["seat-barrel-chair-1", "seat-sectional-sofa-1", "seat-sectional-sofa-4"]);
  });

  test("the table cam looks straight down on the mat and fits it on any screen", () => {
    const view = tableView(DEFAULT_STATIONS);
    expect(view.eye[0]).toBeCloseTo(view.target[0]);
    expect(view.eye[2]).toBeCloseTo(view.target[2]);
    expect(view.eye[1]).toBeLessThan(2.2); // under the ceiling fan
    expect(view.mat.at[1]).toBeGreaterThan(0.51); // over the tray
    const wide = tableFov(view, 16 / 9);
    const tall = tableFov(view, 9 / 16);
    expect(wide).toBeGreaterThan(30);
    expect(tall).toBeGreaterThan(wide);
  });

  test("the bartender stands in the kitchen, the customers in the living room", () => {
    const { bartender, guests } = barSpots(DEFAULT_STATIONS);
    expect(bartender.x).toBeGreaterThan(4.82);
    expect(guests).toHaveLength(6);
    for (const g of guests) {
      expect(g.x).toBeLessThan(4.78);
      expect(g.z).toBeGreaterThan(-3.46);
    }
  });
});

describe("barCast", () => {
  const snapshot = (over: Partial<TavernSnapshot>): TavernSnapshot => ({
    enabled: true,
    shift: null,
    chits: [],
    mutiny: null,
    queueLength: 0,
    sfxOptions: [],
    ...over,
  });
  const chit = (id: string, outcome: "pending" | "served") => ({
    id,
    shiftId: "s",
    dialogue: "",
    payload: {},
    troubleType: null,
    createdAt: "2026-11-06T20:00:00Z",
    deadlineAt: "2026-11-06T20:01:00Z",
    outcome,
  });

  test("only waiting orders stand at the bar", () => {
    const cast = barCast(snapshot({ chits: [chit("a", "pending"), chit("b", "served")] }));
    expect(cast.guests.map((g) => g.id)).toEqual(["a"]);
    expect(cast.bartender).toBeNull();
  });

  test("a closed tavern is an empty bar", () => {
    expect(barCast(snapshot({ enabled: false, chits: [chit("a", "pending")] }))).toEqual({ bartender: null, guests: [] });
    expect(barCast(null)).toEqual({ bartender: null, guests: [] });
  });
});
