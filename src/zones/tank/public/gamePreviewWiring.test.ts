import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// All Rooms tiles show a mini game preview (the room through its game cam)
// instead of a dead tile while the room has no live feed — and never cover a
// live feed. In GAME the Director tile follows the director's game cam.

const read = (...parts: string[]) => readFileSync(join(import.meta.dir, ...parts), "utf8");

describe("mini game previews on the All Rooms tiles", () => {
  test("both grids fall back to the game preview only without a live feed", () => {
    const mobile = read("components", "MobileRoomGrid.tsx");
    expect(mobile).toContain("room.gameSceneUrl && !(isOnline && hasFeed)");
    expect(mobile).toContain("directorGame && !directorOnline");
    const roster = read("components", "CameraRosterPanel.tsx");
    expect(roster).toContain("room.gameSceneUrl && !(isOnline && hasFeed)");
    expect(roster).toContain("<GamePreview roomKey={game.roomKey}");
  });

  test("the page passes scene URLs and the director's game cam", () => {
    const page = read("TankExperience.tsx");
    expect(page.match(/gameSceneUrl: gamePreviewSceneUrl\(room\.roomKey\)/g)?.length).toBe(2);
    expect(page.match(/directorGame=\{directorGamePreview\}/g)?.length).toBe(2);
    expect(page).toContain('serverDirector.mode !== "GAME"');
  });

  test("one shared renderer, loaded on demand", () => {
    const tile = read("components", "GamePreview.tsx");
    expect(tile).toContain('import("../altDirector/gamePreviews")');
    expect(tile).not.toMatch(/^import .*from "three"/m);
    const renderer = read("altDirector", "gamePreviews.ts");
    expect(renderer.match(/new THREE\.WebGLRenderer\(/g)?.length).toBe(1);
  });
});
