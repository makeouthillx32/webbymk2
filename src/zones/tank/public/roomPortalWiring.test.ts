import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Tank public doorway wiring", () => {
  test("the server loads saved portals and passes them to the experience", () => {
    const page = readFileSync(join(import.meta.dir, "..", "Page.tsx"), "utf8");

    expect(page).toContain('import { getAllRoomPortals } from "./server/roomPortalsCatalog";');
    expect(page).toContain("getAllRoomPortals().catch(() => [])");
    expect(page).toContain("initialRoomPortals={roomPortals}");
  });

  test("doorways follow the displayed camera in rooms and Director", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(experience).toContain('import { RoomPortalOverlay } from "./components/RoomPortalOverlay";');
    expect(experience).toContain("const portalSourceRoomSlug =");
    expect(experience).toContain("heroLive?.roomScope ||");
    expect(experience).toContain(
      '(mode === "room" || mode === "director") &&',
    );
    expect(experience).toContain("!heroPlayerStyle &&");
    expect(experience).toContain("onSelectRoom={openRoom}");
  });

  test("the displayed room refreshes its doors after the server-render deadline", () => {
    const experience = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

    expect(experience).toContain(
      'import { fetchPortalsForRoom } from "../server/portalActions";',
    );
    expect(experience).toContain("fetchPortalsForRoom(portalSourceRoomSlug)");
    expect(experience).toContain("setRoomPortals((current)");
  });

  test("an empty portal table falls back to the built-in doorway catalog", () => {
    const catalog = readFileSync(
      join(import.meta.dir, "..", "server", "roomPortalsCatalog.ts"),
      "utf8",
    );

    expect(catalog.match(/else if \(data && data\.length > 0\)/g)).toHaveLength(2);
    expect(catalog).toContain("return inMemoryPortals.filter(");
    expect(catalog).toContain("return [...inMemoryPortals]");
  });
});
