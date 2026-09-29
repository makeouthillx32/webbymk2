import { describe, expect, test } from "bun:test";
import {
  buildObsSceneCollection,
  obsSceneFilename,
  type ObsExportSource,
} from "./obsSceneExport";

// This file gets imported into OBS on a machine that is broadcasting. A
// malformed collection does not throw anything useful — OBS drops sources
// silently or refuses the import with no explanation — so the shape is pinned
// here rather than discovered live.

const sources: ObsExportSource[] = [
  { name: "Tank Programme", url: "https://tank.unenter.live/obs/director?hud=0", width: 1920, height: 1080, x: 0, y: 0, routeAudio: true },
  { name: "Tank HUD", url: "https://tank.unenter.live/obs/director/hud", width: 1920, height: 1080, x: 0, y: 0 },
  { name: "Tank VU", url: "https://tank.unenter.live/obs/director/vu", width: 1920, height: 1080, x: 0, y: 0 },
];

const build = (overrides: Partial<Parameters<typeof buildObsSceneCollection>[0]> = {}) =>
  buildObsSceneCollection({
    sceneName: "Tank Director",
    collectionName: "Tank Live",
    canvasWidth: 1920,
    canvasHeight: 1080,
    sources,
    ...overrides,
  });

type AnySource = Record<string, any>;

describe("collection shape OBS will accept", () => {
  test("the scene and its inputs live in one flat sources list", () => {
    const c = build() as AnySource;
    const ids = (c.sources as AnySource[]).map((s) => s.id);
    expect(ids.filter((i) => i === "browser_source")).toHaveLength(3);
    expect(ids.filter((i) => i === "scene")).toHaveLength(1);
  });

  test("the scene is named as current, or OBS imports it and shows nothing", () => {
    const c = build() as AnySource;
    expect(c.current_scene).toBe("Tank Director");
    expect(c.current_program_scene).toBe("Tank Director");
    expect(c.scene_order).toEqual([{ name: "Tank Director" }]);
  });

  test("every scene item points at a real input by name and uuid", () => {
    // An item referencing a name that is not in `sources` imports as an empty
    // placeholder — a scene that looks right and renders nothing.
    const c = build() as AnySource;
    const scene = (c.sources as AnySource[]).find((s) => s.id === "scene")!;
    const inputs = new Map(
      (c.sources as AnySource[]).filter((s) => s.id === "browser_source").map((s) => [s.name, s.uuid]),
    );
    for (const item of scene.settings.items) {
      expect(inputs.has(item.name)).toBe(true);
      expect(item.source_uuid).toBe(inputs.get(item.name));
    }
  });

  test("browser sources carry the url and size given", () => {
    const c = build() as AnySource;
    const hud = (c.sources as AnySource[]).find((s) => s.name === "Tank HUD")!;
    expect(hud.settings.url).toBe("https://tank.unenter.live/obs/director/hud");
    expect(hud.settings.width).toBe(1920);
    expect(hud.settings.height).toBe(1080);
  });
});

describe("decisions that would bite on air", () => {
  test("overlays do not take a mixer channel; the programme does", () => {
    // A browser source with audio routed shows a fader for something silent —
    // clutter, and one accidental mute away from a dead programme.
    const c = build() as AnySource;
    const byName = (n: string) => (c.sources as AnySource[]).find((s) => s.name === n)!;
    expect(byName("Tank HUD").settings.reroute_audio).toBe(false);
    expect(byName("Tank HUD").mixers).toBe(0);
    expect(byName("Tank Programme").settings.reroute_audio).toBe(true);
    expect(byName("Tank Programme").mixers).toBeGreaterThan(0);
  });

  test("sources do not shut down when hidden", () => {
    // Shutting down drops the realtime subscription, so the overlay has to
    // reconnect on every scene change — visible on air.
    const c = build() as AnySource;
    for (const s of (c.sources as AnySource[]).filter((x) => x.id === "browser_source")) {
      expect(s.settings.shutdown).toBe(false);
      expect(s.settings.restart_when_active).toBe(false);
    }
  });

  test("audio monitoring is off, so importing does not blast the operator", () => {
    const c = build() as AnySource;
    for (const s of (c.sources as AnySource[]).filter((x) => x.id === "browser_source")) {
      expect(s.monitoring_type).toBe(0);
    }
  });

  test("items are pinned top-left, not centred", () => {
    // align 5 is top-left. Centred (0) would offset every overlay by half its
    // own size, and these overlays already anchor themselves internally.
    const c = build() as AnySource;
    const scene = (c.sources as AnySource[]).find((s) => s.id === "scene")!;
    for (const item of scene.settings.items) expect(item.align).toBe(5);
  });

  test("the base programme is the FIRST item, so overlays land on top of it", () => {
    // OBS enumerates scene items bottom-to-top, so first == back of the scene.
    const c = build() as AnySource;
    const scene = (c.sources as AnySource[]).find((s) => s.id === "scene")!;
    expect(scene.settings.items[0].name).toBe("Tank Programme");
  });
});

describe("duplicate names", () => {
  test("two sources with one name are disambiguated, not merged", () => {
    // In OBS a scene item binds to an input BY NAME. Two items sharing a name
    // bind to the same input, so editing one silently changes both.
    const c = buildObsSceneCollection({
      sceneName: "S",
      collectionName: "C",
      canvasWidth: 1920,
      canvasHeight: 1080,
      sources: [
        { name: "Overlay", url: "https://a.test/1", width: 100, height: 100, x: 0, y: 0 },
        { name: "Overlay", url: "https://a.test/2", width: 100, height: 100, x: 0, y: 0 },
      ],
    }) as AnySource;
    const names = (c.sources as AnySource[])
      .filter((s) => s.id === "browser_source")
      .map((s) => s.name);
    expect(new Set(names).size).toBe(2);
    expect(names).toContain("Overlay");
  });

  test("a blank name still produces something addressable", () => {
    const c = buildObsSceneCollection({
      sceneName: "S",
      collectionName: "C",
      canvasWidth: 1920,
      canvasHeight: 1080,
      sources: [{ name: "   ", url: "https://a.test/1", width: 10, height: 10, x: 0, y: 0 }],
    }) as AnySource;
    const input = (c.sources as AnySource[]).find((s) => s.id === "browser_source")!;
    expect(input.name.length).toBeGreaterThan(0);
  });
});

describe("exports are reproducible", () => {
  test("the same scene exports identically every time", () => {
    // Random UUIDs would make two exports of one scene differ, so re-importing
    // would duplicate sources instead of replacing them, and diffing two
    // exports would be useless.
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  test("different source names get different uuids", () => {
    const c = build() as AnySource;
    const uuids = (c.sources as AnySource[]).map((s) => s.uuid);
    expect(new Set(uuids).size).toBe(uuids.length);
  });

  test("uuids are well-formed v4", () => {
    const c = build() as AnySource;
    for (const s of c.sources as AnySource[]) {
      expect(s.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe("filename", () => {
  test("a readable name becomes a safe file", () => {
    expect(obsSceneFilename("Tank Live — Director")).toBe("tank-live-director.json");
  });

  test("a name made entirely of punctuation still yields a file", () => {
    expect(obsSceneFilename("///")).toBe("tank-scene.json");
    expect(obsSceneFilename("")).toBe("tank-scene.json");
  });
});
