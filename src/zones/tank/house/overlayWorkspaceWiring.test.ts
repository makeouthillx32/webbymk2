import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (name: string) =>
  readFileSync(join(import.meta.dir, name), "utf8");

describe("House overlay workshop wiring", () => {
  test("the Overlays deck mounts the complete workshop rather than only legacy triggers", () => {
    const consoleSource = source("HouseConsole.tsx");

    expect(consoleSource).toContain(
      'import { HouseOverlayWorkspace } from "./HouseOverlayWorkspace"',
    );
    expect(consoleSource).toContain(
      "<HouseOverlayWorkspace rooms={rooms} operatorRole={operatorRole} />",
    );
    expect(consoleSource).not.toContain(
      "<OverlaysPanel operatorRole={operatorRole} />",
    );
  });

  test("Place in OBS Studio returns to the real Director Studio deck", () => {
    const panelSource = source("DirectorOverlayWorkshopPanel.tsx");

    expect(panelSource).toContain('params.set("deck", "director")');
    expect(panelSource).not.toContain('params.set("deck", "studio")');
  });
});
