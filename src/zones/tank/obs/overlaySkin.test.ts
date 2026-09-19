import { describe, expect, test } from "bun:test";
import {
  isOverlayTexture,
  OVERLAY_TEXTURES,
  resolveOverlaySkin,
  TANK_OVERLAY_FONTS,
} from "./overlaySkin";

// These values are composited onto a live broadcast, where the two ways to fail
// are both invisible in review: a texture that does not load leaving an unreadable
// panel, and a font that does not load leaving text that does not render.

describe("choosing a texture", () => {
  test("every advertised texture resolves", () => {
    for (const { id } of OVERLAY_TEXTURES) {
      expect(resolveOverlaySkin(id).texture).toBe(id);
    }
  });

  test("anything unrecognised falls back to clean rather than throwing", () => {
    // This value arrives from a URL an operator typed. A throw here is a blank
    // browser source.
    for (const bad of [null, undefined, "", "chrome", 7, {}, []]) {
      expect(resolveOverlaySkin(bad).texture).toBe("clean");
    }
  });

  test("isOverlayTexture guards the stored/URL value", () => {
    expect(isOverlayTexture("plate")).toBe(true);
    expect(isOverlayTexture("marble")).toBe(false);
    expect(isOverlayTexture(undefined)).toBe(false);
  });
});

describe("surviving a missing asset", () => {
  test("every skin paints a solid colour under its texture", () => {
    // The textures come from Supabase Storage. If it is unreachable the image
    // never paints, and this colour is the entire panel — without it the overlay
    // becomes transparent and the text sits directly on the camera.
    for (const { id } of OVERLAY_TEXTURES) {
      const skin = resolveOverlaySkin(id);
      expect(skin.panel.backgroundColor).toBeTruthy();
      expect(skin.panel.backgroundColor).not.toBe("transparent");
    }
  });

  test("every font stack ends in a local generic", () => {
    // Same failure, for type: the Tank faces are fetched from Supabase, and a
    // stack of only remote families renders nothing when the fetch fails.
    const generics = ["sans-serif", "monospace", "serif"];
    for (const stack of Object.values(TANK_OVERLAY_FONTS)) {
      const last = stack.split(",").pop()!.trim();
      expect(generics).toContain(last);
    }
  });

  test("font stacks actually name the Tank families first", () => {
    expect(TANK_OVERLAY_FONTS.label).toStartWith('"Tank Highway Gothic"');
    expect(TANK_OVERLAY_FONTS.display).toStartWith('"Tank Alarm Clock"');
    expect(TANK_OVERLAY_FONTS.dotMatrix).toStartWith('"Tank 5x5 Dots"');
  });
});

describe("staying readable over photographic metal", () => {
  test("every skin carries a text shadow", () => {
    for (const { id } of OVERLAY_TEXTURES) {
      expect(resolveOverlaySkin(id).textShadow).toBeTruthy();
    }
  });

  test("the light skin uses dark ink and the dark skins use light ink", () => {
    // Aluminium is a bright panel; white text on it is unreadable exactly where
    // the highlight looks best.
    expect(resolveOverlaySkin("aluminum").isLight).toBe(true);
    expect(resolveOverlaySkin("aluminum").ink).toBe("#14181a");
    expect(resolveOverlaySkin("metal").isLight).toBe(false);
    expect(resolveOverlaySkin("clean").isLight).toBe(false);
  });

  test("every skin defines an accent and a live colour", () => {
    // Hardcoded yellow-400/emerald-400 was the old approach and it vanished on
    // aluminium. Each skin now names its own.
    for (const { id } of OVERLAY_TEXTURES) {
      const skin = resolveOverlaySkin(id);
      expect(skin.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(skin.live).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("the light skin darkens its accent instead of reusing the dark one", () => {
    expect(resolveOverlaySkin("aluminum").accent).not.toBe(resolveOverlaySkin("clean").accent);
  });

  test("muted ink is distinct from primary ink on every skin", () => {
    for (const { id } of OVERLAY_TEXTURES) {
      const skin = resolveOverlaySkin(id);
      expect(skin.inkMuted).not.toBe(skin.ink);
    }
  });
});

describe("the riveted plate", () => {
  test("draws four screws plus the metal, as background layers", () => {
    const skin = resolveOverlaySkin("plate");
    const layers = skin.panel.backgroundImage.split("url(").length - 1;
    expect(layers).toBe(5);
    expect(skin.panel.backgroundRepeat?.split(",")).toHaveLength(5);
    expect(skin.panel.backgroundSize?.split(",")).toHaveLength(5);
  });

  test("layer counts match across image, position, size and repeat", () => {
    // A mismatched count silently drops or repeats layers in CSS — the screws
    // end up tiled across the panel rather than pinned to its corners.
    const panel = resolveOverlaySkin("plate").panel;
    const count = (value: string) => value.split(",").length;
    expect(count(panel.backgroundPosition)).toBe(count(panel.backgroundSize));
    expect(count(panel.backgroundRepeat)).toBe(count(panel.backgroundSize));
  });

  test("reserves padding so the screws do not sit under the text", () => {
    expect(resolveOverlaySkin("plate").panel.padding).toBeTruthy();
    expect(resolveOverlaySkin("metal").panel.padding).toBeUndefined();
  });
});
