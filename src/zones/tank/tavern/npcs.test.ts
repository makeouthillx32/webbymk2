import { describe, expect, test } from "bun:test";
import { castGuests, npcHash, parseNpcPool, type TankNpc } from "./npcs";

const RAW = {
  version: "330ad45bfa6f",
  cell: [96, 128],
  npcs: [
    { id: "dee", name: "Dee", frames: 16, fps: 8 },
    { id: "hank", name: "Hank", frames: 16, fps: 8 },
    { id: "foreman", name: "Foreman", frames: 4, fps: 6 },
    { id: "Bad Id", name: "x", frames: 16, fps: 8 },
    { id: "nofps", name: "x", frames: 16 },
    { id: "huge", name: "x", frames: 900, fps: 8 },
  ],
};

describe("tank npc pool", () => {
  test("parses the published pool, drops anything malformed, versions the strips", () => {
    const pool = parseNpcPool(RAW, "https://cdn/npcs")!;
    expect(pool.cell).toEqual([96, 128]);
    expect(pool.npcs.map((n) => n.id)).toEqual(["dee", "hank", "foreman"]);
    expect(pool.npcs[0].strip).toBe("https://cdn/npcs/dee.webp?v=330ad45bfa6f");
    expect(parseNpcPool({ cell: [96, 128], npcs: [] })).toBeNull();
    expect(parseNpcPool(null)).toBeNull();
  });

  test("the same guest is the same stranger everywhere; twins at the bar are avoided", () => {
    const npcs = parseNpcPool(RAW, "x")!.npcs as TankNpc[];
    const guests = ["a", "b", "c"].map((id, i) => ({ id, createdAt: `2026-11-06T00:00:0${i}Z` }));
    const once = castGuests(guests, npcs);
    const again = castGuests([...guests].reverse(), npcs);
    expect([...once.entries()].map(([k, v]) => [k, v.id])).toEqual(
      guests.map((g) => [g.id, again.get(g.id)!.id]),
    );
    // Three guests, three strangers: nobody is served twice.
    expect(new Set([...once.values()].map((n) => n.id)).size).toBe(3);
    // The first guest's pick is just their hash.
    expect(once.get("a")!.id).toBe(npcs[npcHash("a") % npcs.length].id);
    // More guests than strangers still gives everyone someone.
    const crowd = Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, createdAt: `2026-11-06T00:00:0${i}Z` }));
    expect(castGuests(crowd, npcs).size).toBe(5);
    expect(castGuests(crowd, []).size).toBe(0);
  });
});
