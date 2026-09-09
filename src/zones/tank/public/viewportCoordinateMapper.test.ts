import { describe, it, expect } from "bun:test";
import {
  getRenderedVideoRect,
  clientToNormalizedVideoCoords,
  normalizedToContainerCss,
  compensatePtzCrop,
  isTargetHit,
} from "./viewportCoordinateMapper";

describe("Precision Viewport Tap Coordinate Normalizer", () => {
  it("calculates exact center on a matching 16:9 container (1920x1080)", () => {
    const container = { left: 0, top: 0, width: 1920, height: 1080 };
    const result = clientToNormalizedVideoCoords(960, 540, container);

    expect(result.isInsideVideo).toBe(true);
    expect(result.nx).toBe(0.5);
    expect(result.ny).toBe(0.5);
    expect(result.globalNx).toBe(0.5);
    expect(result.globalNy).toBe(0.5);
    expect(result.renderedRect.offsetX).toBe(0);
    expect(result.renderedRect.offsetY).toBe(0);
  });

  it("handles letterboxing on a tall screen (1000x1000 square container)", () => {
    const container = { left: 0, top: 0, width: 1000, height: 1000 };

    // 1. Click on top black bar (clientY = 50px)
    const topBarResult = clientToNormalizedVideoCoords(500, 50, container);
    expect(topBarResult.isInsideVideo).toBe(false);

    // 2. Click on exact center of the video frame
    const centerResult = clientToNormalizedVideoCoords(500, 500, container);
    expect(centerResult.isInsideVideo).toBe(true);
    expect(centerResult.nx).toBe(0.5);
    expect(centerResult.ny).toBe(0.5);
  });

  it("handles pillarboxing on an ultrawide monitor (2560x1080 container)", () => {
    const container = { left: 100, top: 50, width: 2560, height: 1080 };

    // 1. Click on left black bar (clientX = 150px)
    const leftBarResult = clientToNormalizedVideoCoords(150, 500, container);
    expect(leftBarResult.isInsideVideo).toBe(false);

    // 2. Click on exact video origin (nx=0, ny=0) -> clientX = 100 + 320 = 420, clientY = 50
    const originResult = clientToNormalizedVideoCoords(420, 50, container);
    expect(originResult.isInsideVideo).toBe(true);
    expect(originResult.nx).toBe(0);
    expect(originResult.ny).toBe(0);
  });

  it("maps object-cover through the cropped source rectangle", () => {
    const square = { left: 0, top: 0, width: 1000, height: 1000 };
    const leftEdge = clientToNormalizedVideoCoords(0, 500, square, 16 / 9, "cover");
    const center = clientToNormalizedVideoCoords(500, 500, square, 16 / 9, "cover");
    const rightEdge = clientToNormalizedVideoCoords(1000, 500, square, 16 / 9, "cover");

    expect(leftEdge.isInsideVideo).toBe(true);
    expect(leftEdge.nx).toBeCloseTo(0.21875, 4);
    expect(center.nx).toBe(0.5);
    expect(rightEdge.nx).toBeCloseTo(0.78125, 4);
  });

  it("compensates for digital PTZ zoom and pan offsets into global canvas percentages", () => {
    // PTZ 2.0x zoom centered on top-right quadrant (panOffsetX = 1920, panOffsetY = 0)
    const ptzState = {
      zoomFactor: 2.0,
      panOffsetX: 1920,
      panOffsetY: 0,
      zoomSpeed: 5,
    };

    // Center of the zoomed viewport (nx = 0.5, ny = 0.5)
    // Global canvas: panX + 0.5 * (3840 / 2) = 1920 + 960 = 2880 -> 2880 / 3840 = 0.75
    // Global canvas: panY + 0.5 * (2160 / 2) = 0 + 540 = 540 -> 540 / 2160 = 0.25
    const comp = compensatePtzCrop(0.5, 0.5, ptzState);
    expect(comp.globalNx).toBe(0.75);
    expect(comp.globalNy).toBe(0.25);
  });

  it("evaluates target hit detection with touch tolerance padding", () => {
    // Target box for Mochi the cat at [nx: 0.40, ny: 0.50, nw: 0.15, nh: 0.15]
    const target = { nx: 0.40, ny: 0.50, nw: 0.15, nh: 0.15 };

    // Exact direct center tap
    expect(isTargetHit(0.475, 0.575, target)).toBe(true);

    // Near miss within 3.5% tolerance padding (nx = 0.38 is within 0.40 - 0.035 = 0.365)
    expect(isTargetHit(0.38, 0.55, target, 0.035)).toBe(true);

    // Completely far tap
    expect(isTargetHit(0.10, 0.10, target, 0.035)).toBe(false);
  });

  it("reverses normalized coordinates back to CSS pixels accurately", () => {
    const css = normalizedToContainerCss(0.5, 0.5, 1920, 1080);
    expect(css.left).toBe(960);
    expect(css.top).toBe(540);
  });
});
