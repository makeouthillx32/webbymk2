import { describe, expect, test } from "bun:test";
import {
  buildDirectorOverlayUrl,
  DIRECTOR_OVERLAY_WORKSHOP,
  getDirectorOverlay,
  getDirectorOverlayByRoute,
} from "./directorOverlayWorkshop";

const ORIGIN = "https://tank.unenter.live";

describe("the URL only carries what the operator changed", () => {
  test("touching nothing produces a bare route", () => {
    // A URL listing every parameter hides which ones were chosen on purpose.
    expect(buildDirectorOverlayUrl(ORIGIN, "hud")).toBe(`${ORIGIN}/obs/director/hud`);
    expect(buildDirectorOverlayUrl(ORIGIN, "hud")).toBe(`${ORIGIN}/obs/director/hud`);
  });

  test("a value equal to the default is left out", () => {
    expect(buildDirectorOverlayUrl(ORIGIN, "clock", { seconds: true })).toBe(
      `${ORIGIN}/obs/director/clock`,
    );
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: 420 })).toBe(
      `${ORIGIN}/obs/goal`,
    );
  });

  test("a texture is written when chosen and omitted when it is the default", () => {
    expect(buildDirectorOverlayUrl(ORIGIN, "hud", { texture: "plate" })).toBe(
      `${ORIGIN}/obs/director/hud?texture=plate`,
    );
    // "clean" is the default, so it is left out — same rule as every other
    // field, keeping the pasted URL readable.
    expect(buildDirectorOverlayUrl(ORIGIN, "hud", { texture: "clean" })).toBe(
      `${ORIGIN}/obs/director/hud`,
    );
  });

  test("a texture the overlay cannot render is refused, not written", () => {
    // Writing it would produce a URL that looks configured and renders the
    // default — the failure mode where a control appears to do nothing.
    expect(buildDirectorOverlayUrl(ORIGIN, "hud", { texture: "marble" })).toBe(
      `${ORIGIN}/obs/director/hud`,
    );
  });

  test("every visual overlay offers the texture picker", () => {
    // The point of the change: they should look like one family on air.
    for (const id of ["hud", "rec", "room", "clock", "attention", "vu", "goal"] as const) {
      const field = getDirectorOverlay(id)?.fields.find((f) => f.key === "texture");
      expect(field?.kind).toBe("choice");
    }
  });

  test("caption text is written when set", () => {
    const url = buildDirectorOverlayUrl(ORIGIN, "hud", { label: "LIVE FROM THE KITCHEN" });
    expect(url).toBe(`${ORIGIN}/obs/director/hud?label=LIVE+FROM+THE+KITCHEN`);
  });

  test("blank and whitespace text are not written", () => {
    // `?label=` with nothing after it is a typo, and the overlay reads it as an
    // explicit empty caption rather than "follow the director".
    expect(buildDirectorOverlayUrl(ORIGIN, "hud", { label: "" })).toBe(`${ORIGIN}/obs/director/hud`);
    expect(buildDirectorOverlayUrl(ORIGIN, "hud", { label: "   " })).toBe(
      `${ORIGIN}/obs/director/hud`,
    );
  });
});

describe("flags that default ON must be written when switched OFF", () => {
  test("turning the meter off emits vu=0", () => {
    // Every one of these is read as `get(key) !== "0"`, so OMITTING a flag means
    // ENABLED. If an off switch wrote nothing, it would silently do nothing —
    // the same trap as `hud=0` on the director route.
    expect(buildDirectorOverlayUrl(ORIGIN, "vu", { vu: false })).toBe(
      `${ORIGIN}/obs/director/vu?vu=0`,
    );
  });

  test("leaving an on-by-default flag on writes nothing", () => {
    expect(buildDirectorOverlayUrl(ORIGIN, "vu", { vu: true, watermark: true })).toBe(
      `${ORIGIN}/obs/director/vu`,
    );
  });

  test("turning an off-by-default flag on emits =1", () => {
    expect(buildDirectorOverlayUrl(ORIGIN, "attention", { preview: true })).toBe(
      `${ORIGIN}/obs/director/attention?preview=1`,
    );
  });

  test("both meter and watermark off are both written", () => {
    const url = new URL(buildDirectorOverlayUrl(ORIGIN, "vu", { vu: false, watermark: false }));
    expect(url.searchParams.get("vu")).toBe("0");
    expect(url.searchParams.get("watermark")).toBe("0");
  });
});

describe("numbers are clamped to what the overlay accepts", () => {
  test("an out-of-range value is pulled to the limit, not passed through", () => {
    // The overlay clamps too, so an absurd value would not break it — but the
    // URL the operator copies should say what will actually happen.
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: 99_999 })).toBe(
      `${ORIGIN}/obs/goal?width=1600`,
    );
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: -500 })).toBe(
      `${ORIGIN}/obs/goal?width=160`,
    );
  });

  test("a number is clamped to the range its own field declares", () => {
    // Over the maximum clamps down to it, and 1600 differs from the 420
    // default, so it is written rather than omitted.
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: 9999 })).toBe(
      `${ORIGIN}/obs/goal?width=1600`,
    );
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: 1 })).toBe(
      `${ORIGIN}/obs/goal?width=160`,
    );
  });

  test("a non-numeric value is ignored rather than written as NaN", () => {
    expect(buildDirectorOverlayUrl(ORIGIN, "goal", { width: "banana" })).toBe(
      `${ORIGIN}/obs/goal`,
    );
  });
});

describe("the catalogue itself", () => {
  test("every overlay the workshop offers has a route and at least one control", () => {
    for (const entry of DIRECTOR_OVERLAY_WORKSHOP) {
      // Every route must be an /obs page AND must resolve back to this entry.
      // The round-trip is the part that matters: a prefix check passes on a
      // typo'd route, and the failure mode of a typo is a Workshop control
      // that writes settings no overlay will ever read.
      expect(entry.route.startsWith("/obs/")).toBe(true);
      expect(getDirectorOverlayByRoute(entry.route)?.id).toBe(entry.id);
      expect(entry.fields.length).toBeGreaterThan(0);
    }
  });

  test("field keys are unique within an overlay", () => {
    // A duplicate key would have one control silently overwrite the other.
    for (const entry of DIRECTOR_OVERLAY_WORKSHOP) {
      const keys = entry.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test("every overlay the Workshop is meant to offer is registered", () => {
    expect(DIRECTOR_OVERLAY_WORKSHOP.map((e) => e.id).sort()).toEqual([
      "attention",
      "chat",
      "clock",
      "goal",
      "hud",
      "rec",
      "room",
      "vu",
    ]);
  });

  test("an unknown overlay is refused rather than silently producing a bad URL", () => {
    expect(getDirectorOverlay("nope")).toBeUndefined();
    // @ts-expect-error deliberately invalid id
    expect(() => buildDirectorOverlayUrl(ORIGIN, "nope")).toThrow();
  });

  test("an empty origin still yields the production URL", () => {
    expect(buildDirectorOverlayUrl("", "hud")).toBe("https://tank.unenter.live/obs/director/hud");
  });
});

describe("matching a layer URL back to its overlay", () => {
  test("an absolute browser-source URL resolves", () => {
    expect(getDirectorOverlayByRoute("https://tank.unenter.live/obs/director/hud")?.id).toBe("hud");
  });

  test("a relative path resolves, because that is what layers store", () => {
    expect(getDirectorOverlayByRoute("/obs/director/vu")?.id).toBe("vu");
  });

  test("a query string does not prevent a match", () => {
    // A layer configured with a pinned parameter is still that overlay.
    expect(getDirectorOverlayByRoute("/obs/director/hud?label=X")?.id).toBe("hud");
  });

  test("a trailing slash does not prevent a match", () => {
    expect(getDirectorOverlayByRoute("/obs/director/attention/")?.id).toBe("attention");
  });

  test("the composed director page resolves to the programme's own settings", () => {
    // It used to resolve to nothing, because every entry was a separate layer.
    // Since the cut transition moved onto the programme source (a standalone
    // CRT source can never stay in sync with the swap it covers), /obs/director
    // is now a configurable thing in its own right — and the Studio deck's
    // "Configure in Workshop" button on the programme layer depends on this.
    // The CRT transition was removed from the Workshop 2026-09-13: it is part of
    // the programme source, not a layer, so /obs/director resolves to nothing.
    expect(getDirectorOverlayByRoute("/obs/director")).toBeUndefined();
    expect(getDirectorOverlayByRoute("/obs/director?hud=1")).toBeUndefined();
  });

  test("the retired standalone CRT route resolves to nothing", () => {
    // Removed 2026-09-13. If it ever comes back as a layer, this fails and
    // whoever revived it has to re-read why it was taken out.
    expect(getDirectorOverlayByRoute("/obs/director/crt")).toBeUndefined();
  });

  test("anything foreign returns undefined rather than guessing", () => {
    // A wrong match would send the operator to edit settings that have no
    // effect on the layer in front of them.
    expect(getDirectorOverlayByRoute("/obs/tts")).toBeUndefined();
    expect(getDirectorOverlayByRoute("https://streamelements.com/overlay/abc")).toBeUndefined();
    expect(getDirectorOverlayByRoute("")).toBeUndefined();
    expect(getDirectorOverlayByRoute(null)).toBeUndefined();
    expect(getDirectorOverlayByRoute("::::not a url")).toBeUndefined();
  });
});

describe("every overlay says what size the browser source needs", () => {
  test("each entry carries a recommended size and a reason", () => {
    // "None of them are rendering" in OBS traced to sizing: these overlays
    // anchor to the viewport, so the source IS their coordinate space. A small
    // source does not crop the overlay, it re-anchors it inside the small box.
    for (const entry of DIRECTOR_OVERLAY_WORKSHOP) {
      expect(entry.recommendedWidth).toBeGreaterThan(0);
      expect(entry.recommendedHeight).toBeGreaterThan(0);
      expect(entry.sizingNote.length).toBeGreaterThan(0);
    }
  });

  test("every director overlay asks for the full canvas", () => {
    // Anything that paints must match the canvas, or it anchors to the wrong
    // edges — these overlays position themselves against the viewport.
    //
    // Chat is the exception, and a real one: it is a COLUMN, not a layer over
    // the programme. It fills whatever source it is given, so a full-canvas
    // recommendation would be wrong advice rather than safe advice.
    for (const entry of DIRECTOR_OVERLAY_WORKSHOP) {
      if (entry.id === "chat") continue;
      expect(entry.recommendedWidth).toBe(1920);
      expect(entry.recommendedHeight).toBe(1080);
    }
  });

  test("programme audio is NOT offered as a separate overlay", () => {
    // The hard rule. Sound comes off the same video element as the picture, so
    // it cannot be pointed at another room or drift out of step with it. A
    // re-added "audio" entry here would be a route back to both faults, which
    // is why this asserts absence rather than shape.
    expect(getDirectorOverlay("audio")).toBeUndefined();
    expect(DIRECTOR_OVERLAY_WORKSHOP.some((e) => e.route.includes("/audio"))).toBe(false);
  });
});
