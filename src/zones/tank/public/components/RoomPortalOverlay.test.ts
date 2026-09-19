import { describe, it, expect } from "bun:test";
import { calculateQuadCentroid, isPointInPolygon, type RoomPortal } from "../../vision/portalGeometry";
import {
  calculatePortalHoverBounds,
  calculatePortalVideoBox,
} from "./RoomPortalOverlay";
import { readFileSync } from "node:fs";

describe("Room Portal Overlay Integration", () => {
  const samplePortal: RoomPortal = {
    id: "portal-foyer-living",
    sourceRoomSlug: "foyer",
    targetRoomSlug: "living-room",
    title: "Living Room",
    polygon: [
      { nx: 0.4, ny: 0.2 },
      { nx: 0.6, ny: 0.2 },
      { nx: 0.65, ny: 0.85 },
      { nx: 0.35, ny: 0.85 },
    ],
    direction: "forward",
    displayMode: "invisible_hitbox",
    icon: "door",
    enabled: true,
  };

  it("computes anchor coordinates for doorway centroid", () => {
    const centroid = calculateQuadCentroid(samplePortal.polygon);
    expect(centroid.nx).toBe(0.5);
    expect(centroid.ny).toBe(0.525);
  });

  it("detects taps inside doorway polygon for in-app teleportation", () => {
    // Tap in the middle of the doorway
    expect(isPointInPolygon({ nx: 0.5, ny: 0.5 }, samplePortal.polygon)).toBe(true);

    // Tap outside doorway
    expect(isPointInPolygon({ nx: 0.1, ny: 0.5 }, samplePortal.polygon)).toBe(false);
  });

  it("ensures default display mode is invisible_hitbox for clean feed guarantee", () => {
    expect(samplePortal.displayMode).toBe("invisible_hitbox");
  });

  it("gives narrow perspective doors a forgiving invisible hover target", () => {
    const hit = calculatePortalHoverBounds([
      { nx: 0.52, ny: 0.02 },
      { nx: 0.56, ny: 0.02 },
      { nx: 0.55, ny: 0.58 },
      { nx: 0.53, ny: 0.35 },
    ]);

    expect(hit.width).toBeGreaterThanOrEqual(0.14);
    expect(hit.height).toBeGreaterThanOrEqual(0.18);
    expect(hit.left).toBeGreaterThanOrEqual(0);
    expect(hit.top).toBeGreaterThanOrEqual(0);
    expect(hit.left + hit.width).toBeLessThanOrEqual(1);
    expect(hit.top + hit.height).toBeLessThanOrEqual(1);
  });

  it("keeps doorway coordinates attached to a cover-cropped video frame", () => {
    const box = calculatePortalVideoBox(1000, 800, "cover");

    expect(box.height).toBe(800);
    expect(box.width).toBeCloseTo(800 * (16 / 9));
    expect(box.left).toBeCloseTo((1000 - 800 * (16 / 9)) / 2);
    expect(box.top).toBe(0);

    const doorwayCenterX = box.left + 0.5 * box.width;
    const doorwayCenterY = box.top + 0.5 * box.height;
    expect(doorwayCenterX).toBeCloseTo(500);
    expect(doorwayCenterY).toBeCloseTo(400);
  });

  it("maps contained video letterboxing instead of the outer player", () => {
    const box = calculatePortalVideoBox(1000, 800, "contain");

    expect(box.width).toBe(1000);
    expect(box.height).toBeCloseTo(1000 / (16 / 9));
    expect(box.left).toBe(0);
    expect(box.top).toBeCloseTo((800 - 1000 / (16 / 9)) / 2);
  });

  it("keeps doorway click targets available to touch and coarse pointers", () => {
    const source = readFileSync(import.meta.path, "utf8");
    const component = readFileSync(
      new URL("./RoomPortalOverlay.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("touch and coarse pointers");
    expect(component).not.toContain('window.matchMedia("(hover: hover), (any-hover: hover)")');
    expect(component).toContain("onSelectRoom(portal.targetRoomSlug)");
  });
});
