import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Tank room-view refresh persistence", () => {
  const source = readFileSync(join(import.meta.dir, "TankExperience.tsx"), "utf8");

  test("writes the active view and room into tab-local storage", () => {
    expect(source).toContain("persistRoomValue(LS_ROOM_MODE, mode)");
    expect(source).toContain("persistRoomValue(LS_ROOM_SLUG, slug)");
    expect(source).toContain("window.sessionStorage.setItem(key, value)");
  });

  test("restores All Rooms without changing any part of the URL", () => {
    expect(source).toContain("function readSavedRoomLocation()");
    expect(source).toContain("readSavedRoomLocation() ?? initialLocation ?? browserLocation");
    expect(source).toContain('const explicitRoomPath = pathname === "/rooms" || pathname.startsWith("/rooms/")');
    expect(source).not.toContain('params.set("view"');
    expect(source).not.toContain('params.set("room"');
    expect(source).not.toContain("window.history.pushState");
    expect(source).not.toContain("window.history.replaceState");
    expect(source).not.toContain("function persistRoomLocation(");
  });
});
