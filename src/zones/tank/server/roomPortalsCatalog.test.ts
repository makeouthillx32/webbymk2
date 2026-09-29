import { describe, it, expect } from "bun:test";
import {
  getRoomPortals,
  getAllRoomPortals,
  saveRoomPortal,
  deleteRoomPortal,
} from "./roomPortalsCatalog";

describe("Room Portals Catalog", () => {
  it("returns default seed portals for known rooms", async () => {
    const foyerPortals = await getRoomPortals("foyer");
    expect(foyerPortals.length).toBeGreaterThan(0);
    expect(foyerPortals[0].targetRoomSlug).toBe("living-room");
    expect(foyerPortals[0].polygon.length).toBe(4);
  });

  it("can add, update, and remove a custom portal in memory", async () => {
    const custom = await saveRoomPortal({
      sourceRoomSlug: "bedroom",
      targetRoomSlug: "bathroom",
      title: "Ensuite Bathroom",
      polygon: [
        { nx: 0.1, ny: 0.1 },
        { nx: 0.3, ny: 0.1 },
        { nx: 0.35, ny: 0.45 },
        { nx: 0.3, ny: 0.9 },
        { nx: 0.1, ny: 0.9 },
        { nx: 0.05, ny: 0.45 },
      ],
      direction: "left",
      displayMode: "ambient",
      icon: "door",
      enabled: true,
    });

    expect(custom.id).toBeDefined();

    const bedroomPortals = await getRoomPortals("bedroom");
    expect(bedroomPortals.some((p) => p.id === custom.id)).toBe(true);

    // Delete
    await deleteRoomPortal(custom.id);
    const bedroomAfter = await getRoomPortals("bedroom");
    expect(bedroomAfter.some((p) => p.id === custom.id)).toBe(false);
  });
});
