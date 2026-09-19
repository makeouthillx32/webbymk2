import { describe, expect, test } from "bun:test";
import { HOUSE_OVERLAY_WORKSPACE } from "./overlayWorkspaceCatalog";
import { getDirectorOverlay } from "./directorOverlayWorkshop";

describe("House overlay workspace catalog", () => {
  test("keeps every overlay workspace independently addressable", () => {
    const ids = HOUSE_OVERLAY_WORKSPACE.map((entry) => entry.id);
    // Uniqueness is the property that actually matters — the workspace picks an
    // editor by id, so a duplicate would make one of them unreachable.
    expect(new Set(ids).size).toBe(ids.length);
    // The director entries were added 2026-09-12 when /obs/director was split
    // into independent overlays, each configured here and positioned in the OBS
    // Studio deck. "audio" was removed again on 2026-09-13: programme sound is
    // part of the programme source and is not separately addressable.
    expect(ids).toEqual([
      "program",
      "hud",
      "attention",
      "vu",
      "director",
      "chat",
      "tts",
      "triggered",
    ]);
  });

  test("every card that mounts the generic editor has a definition", () => {
    // The catalog draws the card; DIRECTOR_OVERLAY_WORKSHOP supplies the
    // controls, and HouseOverlayWorkspace picks the editor by asking
    // getDirectorOverlay(id). Keying this test on the id rather than the route
    // matters now that "program" and "director" both point at /obs/director —
    // they are different cards configuring different things on one page.
    const withEditors = HOUSE_OVERLAY_WORKSPACE.filter((entry) => getDirectorOverlay(entry.id));
    expect(withEditors.length).toBeGreaterThan(0);
    for (const entry of withEditors) {
      expect(getDirectorOverlay(entry.id)!.fields.length).toBeGreaterThan(0);
    }
  });

  test("documents a browser route for every overlay family", () => {
    expect(HOUSE_OVERLAY_WORKSPACE.every((entry) => entry.routeLabel.startsWith("/"))).toBe(true);
  });
});

