import { describe, expect, test } from "bun:test";
import {
  computePtzFraming,
  computePtzVideoStyle,
  ptzDetailRatio,
  PTZ_MAX_ZOOM,
  PTZ_SOURCE_HEIGHT,
  PTZ_SOURCE_WIDTH,
} from "./ptzFraming";

// This geometry is applied to the LIVE BROADCAST output. A mistake here does
// not throw — it silently frames the shot somewhere other than where the
// operator pointed it, on air, on four platforms.

describe("zoom at or below 1x produces no override at all", () => {
  test("1x returns null so the plain stylesheet renders the shot", () => {
    // The common case by a wide margin: the director cutting between rooms
    // automatically, never touching PTZ. That path must carry no inline
    // geometry — an inline "100%" is still an override, and overrides are how a
    // rendering regression reaches air unnoticed.
    expect(computePtzFraming({ zoomFactor: 1, panOffsetX: 0, panOffsetY: 0 })).toBeNull();
  });

  test("a below-1x zoom cannot pull the picture away from the frame", () => {
    expect(computePtzFraming({ zoomFactor: 0.25 })).toBeNull();
    expect(computePtzFraming({ zoomFactor: -4 })).toBeNull();
  });

  test("missing, null and malformed state are all just 'no zoom'", () => {
    expect(computePtzFraming(null)).toBeNull();
    expect(computePtzFraming(undefined)).toBeNull();
    expect(computePtzFraming({})).toBeNull();
    expect(computePtzFraming({ zoomFactor: Number.NaN })).toBeNull();
    // Infinity is not a zoom level, it is a corrupt value. Treating it as the
    // max would silently slam the shot to 3x on air; treating it as "no zoom"
    // leaves the picture exactly as the director framed it.
    expect(computePtzFraming({ zoomFactor: Number.POSITIVE_INFINITY })).toBeNull();
  });
});

describe("the crop lands where the operator pointed it", () => {
  test("2x with no pan shows the top-left quarter", () => {
    const f = computePtzFraming({ zoomFactor: 2, panOffsetX: 0, panOffsetY: 0 })!;
    expect(f.widthPercent).toBe(200);
    expect(f.heightPercent).toBe(200);
    expect(f.leftPercent).toBe(0);
    expect(f.topPercent).toBe(0);
  });

  test("2x panned to the far right shows the right half", () => {
    // At 2x the crop is half the frame, so max pan is 1920. Laid out at 200%,
    // that half sits 100% of the container along — hence left: -100%.
    const f = computePtzFraming({ zoomFactor: 2, panOffsetX: 1920, panOffsetY: 0 })!;
    expect(f.leftPercent).toBeCloseTo(-100, 6);
    expect(f.topPercent).toBe(0);
  });

  test("2x panned fully down shows the bottom half", () => {
    const f = computePtzFraming({ zoomFactor: 2, panOffsetX: 0, panOffsetY: 1080 })!;
    expect(f.topPercent).toBeCloseTo(-100, 6);
  });

  test("a mid-frame pan maps proportionally", () => {
    const f = computePtzFraming({ zoomFactor: 2, panOffsetX: 960, panOffsetY: 540 })!;
    expect(f.leftPercent).toBeCloseTo(-50, 6);
    expect(f.topPercent).toBeCloseTo(-50, 6);
  });

  test("3x reaches the far corner without overshooting it", () => {
    // Max pan at 3x is w - w/3 = 2560. Laid out at 300%, that is 200% along.
    const f = computePtzFraming({
      zoomFactor: 3,
      panOffsetX: PTZ_SOURCE_WIDTH,
      panOffsetY: PTZ_SOURCE_HEIGHT,
    })!;
    expect(f.widthPercent).toBe(300);
    expect(f.leftPercent).toBeCloseTo(-200, 6);
    expect(f.topPercent).toBeCloseTo(-200, 6);
  });

  test("automatic 3.47x framing is not flattened to the manual 3x ceiling", () => {
    const f = computePtzFraming({ zoomFactor: 3.47, panOffsetX: 900, panOffsetY: 450 })!;
    expect(f.zoom).toBe(3.47);
    expect(f.widthPercent).toBeCloseTo(347, 6);
  });

  test("all programme surfaces can consume the same layout style", () => {
    const style = computePtzVideoStyle({ zoomFactor: 2, panOffsetX: 960, panOffsetY: 540 });
    expect(style).toMatchObject({
      width: "200%",
      height: "200%",
      left: "-50%",
      top: "-50%",
      transform: "none",
    });
  });
});

describe("the crop can never leave the picture", () => {
  test("a pan past the edge is clamped, not allowed to show black", () => {
    // Off-frame is the visible failure: a band of nothing on the broadcast.
    const clamped = computePtzFraming({ zoomFactor: 2, panOffsetX: 99_999, panOffsetY: 99_999 })!;
    const atLimit = computePtzFraming({ zoomFactor: 2, panOffsetX: 1920, panOffsetY: 1080 })!;
    expect(clamped).toEqual(atLimit);
  });

  test("a negative pan is clamped to the top-left corner", () => {
    const f = computePtzFraming({ zoomFactor: 2, panOffsetX: -500, panOffsetY: -500 })!;
    expect(f.leftPercent).toBe(0);
    expect(f.topPercent).toBe(0);
  });

  test("zoom is capped at the controller's ceiling", () => {
    const f = computePtzFraming({ zoomFactor: 99 })!;
    expect(f.zoom).toBe(PTZ_MAX_ZOOM);
    expect(f.widthPercent).toBe(PTZ_MAX_ZOOM * 100);
  });

  test("the crop's right edge never passes the frame's right edge", () => {
    // The invariant behind all of the above, stated once directly:
    // |left| + width must stay within the laid-out element.
    for (const zoom of [1.25, 1.5, 2, 2.75, 3]) {
      for (const pan of [0, 100, 1000, 2559, 2560, 5000]) {
        const f = computePtzFraming({ zoomFactor: zoom, panOffsetX: pan, panOffsetY: pan })!;
        expect(-f.leftPercent).toBeGreaterThanOrEqual(0);
        // Visible window is 100%; the element extends widthPercent from left.
        expect(f.leftPercent + f.widthPercent).toBeGreaterThanOrEqual(100 - 1e-9);
        expect(f.topPercent + f.heightPercent).toBeGreaterThanOrEqual(100 - 1e-9);
      }
    }
  });
});

describe("detail ratio tells the operator when zoom starts costing them", () => {
  test("a 4K source out at 1080p has a genuinely free 2x", () => {
    // The crop is still 1920 real pixels wide against a 1920-wide output.
    expect(ptzDetailRatio(2, 1920)).toBe(1);
    expect(ptzDetailRatio(1, 1920)).toBe(1);
  });

  test("past that ratio it is upscaling, and says so", () => {
    // 3840/3 = 1280 real pixels stretched across 1920 output.
    expect(ptzDetailRatio(3, 1920)).toBeCloseTo(1280 / 1920, 6);
  });

  test("a 4K output has no free zoom whatsoever", () => {
    // The case that surprises people: making the browser source 4K sharpens
    // the un-zoomed shot AND removes the lossless zoom range entirely.
    expect(ptzDetailRatio(1, 3840)).toBe(1);
    expect(ptzDetailRatio(2, 3840)).toBeCloseTo(0.5, 6);
  });

  test("a nonsense output size reports no loss rather than dividing by zero", () => {
    expect(ptzDetailRatio(2, 0)).toBe(1);
    expect(ptzDetailRatio(2, Number.NaN)).toBe(1);
  });
});
