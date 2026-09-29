// src/zones/tank/vision/portalGeometry.ts
// ─────────────────────────────────────────────────────────────────────────────
// Precision Viewport Portal & Doorway Geometry Engine
//
// Computes point-in-convex-quadrilateral containment, centroid visual anchors,
// convex validation, and clockwise perimeter normalization for camera doorways.
// ─────────────────────────────────────────────────────────────────────────────

export type Point2D = {
  nx: number; // 0.0000 to 1.0000 normalized horizontal coordinate
  ny: number; // 0.0000 to 1.0000 normalized vertical coordinate
};

export type QuadPolygon = [Point2D, Point2D, Point2D, Point2D];
export type PortalPolygon = Point2D[];

export type RoomPortal = {
  id: string;
  sourceRoomSlug: string;
  sourceCameraId?: string;
  targetRoomSlug: string;
  title: string;
  description?: string;
  polygon: PortalPolygon;
  direction?: "forward" | "left" | "right" | "back" | "up" | "down";
  displayMode?: "ambient" | "hover_only" | "always_visible" | "invisible_hitbox";
  icon?: "door" | "arrow" | "stairs" | "couch";
  enabled: boolean;
  sortOrder?: number;
};

export type DoorwayPtzState = {
  zoomFactor?: number | null;
  panOffsetX?: number | null;
  panOffsetY?: number | null;
};

/**
 * Doorway points are calibrated against the uncropped camera frame. Any PTZ
 * movement makes that mapping unsafe, so fail closed unless zoom and both pan
 * offsets are at their neutral values.
 */
export function isDoorwayFrameNeutral(
  ptz: DoorwayPtzState | null | undefined,
): boolean {
  if (!ptz) return true;
  const zoom = ptz.zoomFactor ?? 1;
  const panX = ptz.panOffsetX ?? 0;
  const panY = ptz.panOffsetY ?? 0;
  if (![zoom, panX, panY].every(Number.isFinite)) return false;
  return (
    Math.abs(zoom - 1) <= 0.001 &&
    Math.abs(panX) <= 0.5 &&
    Math.abs(panY) <= 0.5
  );
}

/**
 * Serializes normalized points for an SVG whose viewBox is `0 0 100 100`.
 *
 * SVG's polygon/polyline `points` grammar accepts plain numbers, not CSS
 * percentage lengths. Keeping this conversion in the geometry layer ensures
 * the calibration canvas and the public doorway flash draw the exact same
 * shape at every rendered size.
 */
export function pointsToSvgViewBox(points: readonly Point2D[]): string {
  return points
    .map((point) => `${Number((point.nx * 100).toFixed(4))},${Number((point.ny * 100).toFixed(4))}`)
    .join(" ");
}

/**
 * Computes 2D cross product of vector AB and AP:
 * (B.x - A.x)*(P.y - A.y) - (B.y - A.y)*(P.x - A.x)
 */
export function crossProduct2D(a: Point2D, b: Point2D, p: Point2D): number {
  return (b.nx - a.nx) * (p.ny - a.ny) - (b.ny - a.ny) * (p.nx - a.nx);
}

/**
 * Determines whether point P lies strictly inside or on the boundary of a convex quadrilateral.
 * Works regardless of whether the vertices are ordered clockwise or counter-clockwise.
 */
export function isPointInQuad(point: Point2D, quad: QuadPolygon): boolean {
  return isPointInPolygon(point, quad);
}

/** Point-in-polygon hit test supporting both legacy quads and shaped doors. */
export function isPointInPolygon(point: Point2D, polygon: readonly Point2D[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  const epsilon = 1e-7;
  let inside = false;
  for (let i = 0, previous = polygon.length - 1; i < polygon.length; previous = i++) {
    const p1 = polygon[previous];
    const p2 = polygon[i];
    const cp = crossProduct2D(p1, p2, point);
    if (Math.abs(cp) < epsilon) {
      const minX = Math.min(p1.nx, p2.nx) - epsilon;
      const maxX = Math.max(p1.nx, p2.nx) + epsilon;
      const minY = Math.min(p1.ny, p2.ny) - epsilon;
      const maxY = Math.max(p1.ny, p2.ny) + epsilon;
      if (point.nx >= minX && point.nx <= maxX && point.ny >= minY && point.ny <= maxY) {
        return true;
      }
    }

    const crossesHorizontalRay =
      p1.ny > point.ny !== p2.ny > point.ny &&
      point.nx < ((p2.nx - p1.nx) * (point.ny - p1.ny)) / (p2.ny - p1.ny) + p1.nx;
    if (crossesHorizontalRay) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculates the arithmetic centroid of the quadrilateral for visual anchor placement.
 */
export function calculateQuadCentroid(polygon: readonly Point2D[]): Point2D {
  if (polygon.length === 0) return { nx: 0.5, ny: 0.5 };
  const sumX = polygon.reduce((sum, point) => sum + point.nx, 0);
  const sumY = polygon.reduce((sum, point) => sum + point.ny, 0);
  return {
    nx: parseFloat((sumX / polygon.length).toFixed(4)),
    ny: parseFloat((sumY / polygon.length).toFixed(4)),
  };
}

/**
 * Computes axis-aligned bounding box around the 4-point quad.
 */
export function calculateQuadBoundingBox(polygon: readonly Point2D[]) {
  const xs = polygon.map((p) => p.nx);
  const ys = polygon.map((p) => p.ny);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  const value = crossProduct2D(a, b, c);
  if (Math.abs(value) < 1e-7) return 0;
  return value > 0 ? 1 : -1;
}

function pointOnSegment(a: Point2D, b: Point2D, point: Point2D): boolean {
  return (
    Math.abs(crossProduct2D(a, b, point)) < 1e-7 &&
    point.nx >= Math.min(a.nx, b.nx) - 1e-7 &&
    point.nx <= Math.max(a.nx, b.nx) + 1e-7 &&
    point.ny >= Math.min(a.ny, b.ny) - 1e-7 &&
    point.ny <= Math.max(a.ny, b.ny) + 1e-7
  );
}

function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && pointOnSegment(a, b, c)) ||
    (abD === 0 && pointOnSegment(a, b, d)) ||
    (cdA === 0 && pointOnSegment(c, d, a)) ||
    (cdB === 0 && pointOnSegment(c, d, b))
  );
}

/** Validates an ordered 3-12 point doorway perimeter without requiring convexity. */
export function isPortalPolygonValid(polygon: readonly Point2D[]): boolean {
  if (polygon.length < 3 || polygon.length > 12) return false;
  if (
    polygon.some(
      (point) =>
        !Number.isFinite(point.nx) ||
        !Number.isFinite(point.ny) ||
        point.nx < 0 ||
        point.nx > 1 ||
        point.ny < 0 ||
        point.ny > 1,
    )
  ) {
    return false;
  }

  const area = polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.nx * next.ny - next.nx * point.ny;
  }, 0);
  if (Math.abs(area) < 1e-6) return false;

  for (let first = 0; first < polygon.length; first++) {
    const firstNext = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second++) {
      const secondNext = (second + 1) % polygon.length;
      const adjacent =
        first === second ||
        firstNext === second ||
        secondNext === first;
      if (adjacent) continue;
      if (segmentsIntersect(polygon[first], polygon[firstNext], polygon[second], polygon[secondNext])) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Validates that 4 points form a non-degenerate, strictly convex quadrilateral.
 */
export function isQuadConvex(quad: QuadPolygon): boolean {
  if (!quad || quad.length !== 4) return false;

  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const c = quad[(i + 2) % 4];
    const cp = crossProduct2D(a, b, c);

    if (Math.abs(cp) < 1e-6) {
      // Three consecutive points are collinear
      return false;
    }

    const currentSign = cp > 0 ? 1 : -1;
    if (sign === 0) {
      sign = currentSign;
    } else if (currentSign !== sign) {
      return false;
    }
  }

  return true;
}

/**
 * Sorts 4 points in clockwise order around their centroid to guarantee a clean, uncrossed perimeter.
 */
export function orderQuadClockwise(points: Point2D[]): QuadPolygon | null {
  if (points.length !== 4) return null;

  const centroid = {
    nx: points.reduce((acc, p) => acc + p.nx, 0) / 4,
    ny: points.reduce((acc, p) => acc + p.ny, 0) / 4,
  };

  const sorted = [...points].sort((a, b) => {
    const angleA = Math.atan2(a.ny - centroid.ny, a.nx - centroid.nx);
    const angleB = Math.atan2(b.ny - centroid.ny, b.nx - centroid.nx);
    return angleA - angleB;
  });

  const result: QuadPolygon = [sorted[0], sorted[1], sorted[2], sorted[3]];
  return isQuadConvex(result) ? result : null;
}

/**
 * Determines whether a detection bounding box is within or entering a doorway portal.
 * Checks ground-contact (bottom-centre), mid-body, and bounding box overlap with proximity padding.
 */
export function isDetectionInPortal(
  box: { nx: number; ny: number; nw: number; nh: number },
  portal: RoomPortal,
  proximityPadding = 0.08,
): boolean {
  if (!portal.polygon || portal.polygon.length < 3) return false;

  const groundContact: Point2D = { nx: box.nx + box.nw / 2, ny: box.ny + box.nh };
  const center: Point2D = { nx: box.nx + box.nw / 2, ny: box.ny + box.nh / 2 };

  // Strict containment inside portal polygon
  if (isPointInPolygon(groundContact, portal.polygon) || isPointInPolygon(center, portal.polygon)) {
    return true;
  }

  // Check bounding box intersection with portal bounding box with padding
  const pBox = calculateQuadBoundingBox(portal.polygon);
  const minX = pBox.minX - proximityPadding;
  const maxX = pBox.maxX + proximityPadding;
  const minY = pBox.minY - proximityPadding;
  const maxY = pBox.maxY + proximityPadding;

  const boxMinX = box.nx;
  const boxMaxX = box.nx + box.nw;
  const boxMinY = box.ny;
  const boxMaxY = box.ny + box.nh;

  const overlaps = !(boxMinX > maxX || boxMaxX < minX || boxMinY > maxY || boxMaxY < minY);
  if (!overlaps) return false;

  // Proximity to polygon centroid
  const centroid = calculateQuadCentroid(portal.polygon);
  const distGround = Math.hypot(groundContact.nx - centroid.nx, groundContact.ny - centroid.ny);
  const distCenter = Math.hypot(center.nx - centroid.nx, center.ny - centroid.ny);
  const maxDim = Math.max(pBox.width, pBox.height) / 2 + proximityPadding;

  return distGround <= maxDim || distCenter <= maxDim;
}
