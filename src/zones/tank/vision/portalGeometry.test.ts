import { describe, it, expect } from "bun:test";
import {
  isPointInQuad,
  isPointInPolygon,
  isPortalPolygonValid,
  calculateQuadCentroid,
  calculateQuadBoundingBox,
  isQuadConvex,
  orderQuadClockwise,
  pointsToSvgViewBox,
  isDoorwayFrameNeutral,
  type Point2D,
  type QuadPolygon,
} from "./portalGeometry";

describe("Room Portal Geometry Engine", () => {
  // A standard rectangular doorway in normalized space
  const doorwayQuad: QuadPolygon = [
    { nx: 0.4, ny: 0.2 }, // Top-Left
    { nx: 0.6, ny: 0.2 }, // Top-Right
    { nx: 0.6, ny: 0.8 }, // Bottom-Right
    { nx: 0.4, ny: 0.8 }, // Bottom-Left
  ];

  // A perspective-skewed doorway (trapezoid narrowing toward top)
  const perspectiveQuad: QuadPolygon = [
    { nx: 0.45, ny: 0.25 }, // Top-Left
    { nx: 0.55, ny: 0.25 }, // Top-Right
    { nx: 0.65, ny: 0.85 }, // Bottom-Right
    { nx: 0.35, ny: 0.85 }, // Bottom-Left
  ];

  it("detects points strictly inside a rectangular doorway", () => {
    expect(isPointInQuad({ nx: 0.5, ny: 0.5 }, doorwayQuad)).toBe(true);
    expect(isPointInQuad({ nx: 0.42, ny: 0.25 }, doorwayQuad)).toBe(true);
    expect(isPointInQuad({ nx: 0.58, ny: 0.78 }, doorwayQuad)).toBe(true);
  });

  it("detects points strictly outside the doorway", () => {
    expect(isPointInQuad({ nx: 0.3, ny: 0.5 }, doorwayQuad)).toBe(false); // To the left
    expect(isPointInQuad({ nx: 0.7, ny: 0.5 }, doorwayQuad)).toBe(false); // To the right
    expect(isPointInQuad({ nx: 0.5, ny: 0.1 }, doorwayQuad)).toBe(false); // Above
    expect(isPointInQuad({ nx: 0.5, ny: 0.9 }, doorwayQuad)).toBe(false); // Below
  });

  it("detects points inside a perspective-skewed doorway", () => {
    // Exact center
    expect(isPointInQuad({ nx: 0.5, ny: 0.55 }, perspectiveQuad)).toBe(true);

    // Point in bottom flare (nx=0.38, ny=0.8) - inside the widened threshold
    expect(isPointInQuad({ nx: 0.38, ny: 0.8 }, perspectiveQuad)).toBe(true);

    // Point at top width (nx=0.38, ny=0.25) - outside the narrower top frame
    expect(isPointInQuad({ nx: 0.38, ny: 0.25 }, perspectiveQuad)).toBe(false);
  });

  it("handles points on boundary edges and corners", () => {
    expect(isPointInQuad({ nx: 0.4, ny: 0.2 }, doorwayQuad)).toBe(true);
    expect(isPointInQuad({ nx: 0.5, ny: 0.2 }, doorwayQuad)).toBe(true);
    expect(isPointInQuad({ nx: 0.6, ny: 0.8 }, doorwayQuad)).toBe(true);
  });

  it("calculates exact centroid for positioning floating doorway pills", () => {
    const centroid = calculateQuadCentroid(doorwayQuad);
    expect(centroid.nx).toBe(0.5);
    expect(centroid.ny).toBe(0.5);

    const skewCentroid = calculateQuadCentroid(perspectiveQuad);
    expect(skewCentroid.nx).toBe(0.5);
    expect(skewCentroid.ny).toBe(0.55);
  });

  it("computes bounding boxes accurately", () => {
    const bbox = calculateQuadBoundingBox(doorwayQuad);
    expect(bbox.minX).toBe(0.4);
    expect(bbox.maxX).toBe(0.6);
    expect(bbox.minY).toBe(0.2);
    expect(bbox.maxY).toBe(0.8);
    expect(bbox.width).toBeCloseTo(0.2, 5);
    expect(bbox.height).toBeCloseTo(0.6, 5);
  });

  it("validates convex vs degenerate/self-intersecting quadrilaterals", () => {
    expect(isQuadConvex(doorwayQuad)).toBe(true);
    expect(isQuadConvex(perspectiveQuad)).toBe(true);

    // Bowtie (self-intersecting)
    const bowtieQuad: QuadPolygon = [
      { nx: 0.2, ny: 0.2 },
      { nx: 0.8, ny: 0.8 },
      { nx: 0.8, ny: 0.2 },
      { nx: 0.2, ny: 0.8 },
    ];
    expect(isQuadConvex(bowtieQuad)).toBe(false);

    // Collinear (3 points on a straight line)
    const collinearQuad: QuadPolygon = [
      { nx: 0.2, ny: 0.2 },
      { nx: 0.4, ny: 0.2 },
      { nx: 0.8, ny: 0.2 },
      { nx: 0.5, ny: 0.8 },
    ];
    expect(isQuadConvex(collinearQuad)).toBe(false);
  });

  it("orders scrambled unordered points into a clean clockwise quad", () => {
    const scrambled: Point2D[] = [
      { nx: 0.6, ny: 0.8 }, // BR
      { nx: 0.4, ny: 0.2 }, // TL
      { nx: 0.4, ny: 0.8 }, // BL
      { nx: 0.6, ny: 0.2 }, // TR
    ];

    const ordered = orderQuadClockwise(scrambled);
    expect(ordered).not.toBeNull();
    expect(isQuadConvex(ordered!)).toBe(true);
    expect(isPointInQuad({ nx: 0.5, ny: 0.5 }, ordered!)).toBe(true);
  });

  it("serializes doorway points as valid numeric SVG view-box coordinates", () => {
    expect(pointsToSvgViewBox(doorwayQuad)).toBe("40,20 60,20 60,80 40,80");
    expect(pointsToSvgViewBox(doorwayQuad)).not.toContain("%");
  });

  it("supports shaped doorways with more than four perimeter corners", () => {
    const shapedDoorway: Point2D[] = [
      { nx: 0.1, ny: 0.2 },
      { nx: 0.5, ny: 0.2 },
      { nx: 0.5, ny: 0.5 },
      { nx: 0.3, ny: 0.4 },
      { nx: 0.3, ny: 0.8 },
      { nx: 0.1, ny: 0.8 },
    ];

    expect(isPortalPolygonValid(shapedDoorway)).toBe(true);
    expect(isPointInPolygon({ nx: 0.2, ny: 0.5 }, shapedDoorway)).toBe(true);
    expect(isPointInPolygon({ nx: 0.42, ny: 0.65 }, shapedDoorway)).toBe(false);
  });

  it("rejects a shaped doorway whose perimeter crosses itself", () => {
    const crossedDoorway: Point2D[] = [
      { nx: 0.1, ny: 0.1 },
      { nx: 0.8, ny: 0.8 },
      { nx: 0.8, ny: 0.1 },
      { nx: 0.1, ny: 0.8 },
      { nx: 0.45, ny: 0.95 },
    ];
    expect(isPortalPolygonValid(crossedDoorway)).toBe(false);
  });

  it("disables calibrated doorways whenever PTZ leaves the full frame", () => {
    expect(isDoorwayFrameNeutral(null)).toBe(true);
    expect(
      isDoorwayFrameNeutral({ zoomFactor: 1, panOffsetX: 0, panOffsetY: 0 }),
    ).toBe(true);
    expect(
      isDoorwayFrameNeutral({ zoomFactor: 1.01, panOffsetX: 0, panOffsetY: 0 }),
    ).toBe(false);
    expect(
      isDoorwayFrameNeutral({ zoomFactor: 1, panOffsetX: 1, panOffsetY: 0 }),
    ).toBe(false);
    expect(
      isDoorwayFrameNeutral({ zoomFactor: 1, panOffsetX: 0, panOffsetY: 1 }),
    ).toBe(false);
  });
});
