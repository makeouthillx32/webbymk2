// src/zones/tank/vision/homography.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mapping what a camera sees onto the floor of the house.
//
// A detection box is a rectangle in ONE camera's image. Two cameras looking at
// the same person produce two unrelated rectangles, which is why tracking today
// cannot survive someone walking from the foyer into the living room — they
// vanish as foyer/box-3 and reappear as living-room/box-1.
//
// A planar homography fixes that for the one plane that matters: the floor.
// Given four points whose position is known both in a camera's image AND on the
// floor, it produces the 3x3 matrix that maps any other floor point between the
// two. Run every camera's detections through its own matrix and they all land
// in ONE coordinate space — the room's FLOOR, measured in metres — where "is
// this the same person" becomes a distance comparison instead of a guess.
//
// THE PLANE IS THE WHOLE CAVEAT. A homography is exact only for points actually
// on the plane it was fitted to. A person's head is ~1.7 m above the floor and
// will project to nonsense; their feet are on it. So the tracker feeds this the
// ground-contact point (bottom-centre of the box) and nothing else. See
// groundContactPoint() below.
//
// Convention used throughout:
//   image  = NORMALISED image coordinates, x and y in 0..1, origin top-left.
//            That is exactly what the decoder already emits (nx/ny/nw/nh), so
//            nothing has to know the camera's resolution.
//   floor  = metres on the floor plane, origin and axes chosen per house.
// ─────────────────────────────────────────────────────────────────────────────

/** Row-major 3x3. h[2][2] is normalised to 1 by the solver. */
export type Homography = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export type Point2 = { x: number; y: number };

/** One known correspondence: a point visible in the image, measured on the floor. */
export type Correspondence = { image: Point2; floor: Point2 };

/**
 * Solve the 3x3 homography taking `image` points to `floor` points.
 *
 * Direct Linear Transform on exactly four correspondences. Each pair gives two
 * equations; fixing h33 = 1 leaves 8 unknowns, so four points is the minimum
 * and, here, the exact solution — no least-squares.
 *
 * Returns null rather than throwing when the points are degenerate (three
 * collinear, two coincident, all four on a line). That is a real operator
 * mistake — clicking four points along a wall edge instead of the corners of a
 * rug — and it must surface as "calibration rejected", not as a matrix full of
 * NaN that silently poisons every track downstream.
 */
export function solveHomography(points: readonly Correspondence[]): Homography | null {
  if (points.length !== 4) return null;

  // 8x9 augmented system: A·h = b, h = [h11 h12 h13 h21 h22 h23 h31 h32].
  const A: number[][] = [];
  for (const { image, floor } of points) {
    const { x, y } = image;
    const { x: X, y: Y } = floor;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(X) || !Number.isFinite(Y)) {
      return null;
    }
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X]);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }

  const h = gaussianSolve(A, 8);
  if (!h) return null;

  const matrix: Homography = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];

  // A solver can succeed numerically on input that is geometrically nonsense.
  // Round-trip the inputs: if the matrix cannot reproduce the very points it was
  // fitted to, it is not usable.
  for (const { image, floor } of points) {
    const projected = applyHomography(matrix, image);
    if (!projected) return null;
    if (Math.abs(projected.x - floor.x) > 1e-6 || Math.abs(projected.y - floor.y) > 1e-6) {
      return null;
    }
  }

  return matrix;
}

/**
 * Project a point through a homography.
 *
 * Returns null when the point lands on or behind the horizon (w ≈ 0). That is
 * not a rounding problem — it is the camera being asked about a floor point
 * infinitely far away, and the honest answer is "no position", not a coordinate
 * with eleven digits.
 */
export function applyHomography(h: Homography, p: Point2): Point2 | null {
  const w = h[2][0] * p.x + h[2][1] * p.y + h[2][2];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null;
  const x = (h[0][0] * p.x + h[0][1] * p.y + h[0][2]) / w;
  const y = (h[1][0] * p.x + h[1][1] * p.y + h[1][2]) / w;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * Invert a homography, for drawing floor-space things back onto a camera image
 * (a track's breadcrumb trail over the live feed, say).
 */
export function invertHomography(h: Homography): Homography | null {
  const [a, b, c] = h[0];
  const [d, e, f] = h[1];
  const [g, i, j] = h[2];

  const det = a * (e * j - f * i) - b * (d * j - f * g) + c * (d * i - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;

  const inv = [
    [(e * j - f * i) / det, (c * i - b * j) / det, (b * f - c * e) / det],
    [(f * g - d * j) / det, (a * j - c * g) / det, (c * d - a * f) / det],
    [(d * i - e * g) / det, (b * g - a * i) / det, (a * e - b * d) / det],
  ];

  // Renormalise so h33 = 1, matching the convention the solver produces.
  const s = inv[2][2];
  if (!Number.isFinite(s) || Math.abs(s) < 1e-12) return null;
  return [
    [inv[0][0] / s, inv[0][1] / s, inv[0][2] / s],
    [inv[1][0] / s, inv[1][1] / s, inv[1][2] / s],
    [inv[2][0] / s, inv[2][1] / s, 1],
  ];
}

/**
 * The point on a detection box that is actually on the floor.
 *
 * Bottom-centre: where a standing person's feet meet the ground. This is the
 * ONLY part of a person's bounding box a floor homography can map correctly —
 * projecting the box centre would place everyone roughly a metre behind
 * themselves, and the error grows with distance from the camera.
 *
 * Takes normalised box coordinates, the same ones the decoder emits.
 */
export function groundContactPoint(box: {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
}): Point2 {
  return { x: box.nx + box.nw / 2, y: box.ny + box.nh };
}

/**
 * Gaussian elimination with partial pivoting on an n x (n+1) augmented matrix.
 * Returns null if the system is singular — which is exactly how degenerate
 * calibration points present.
 */
function gaussianSolve(m: number[][], n: number): number[] | null {
  const a = m.map((row) => [...row]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    // Partial pivoting is what makes this stable enough to trust; without it a
    // small leading coefficient blows the whole solution up.
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      if (!Number.isFinite(factor)) return null;
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }

  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = a[i][n] / a[i][i];
    if (!Number.isFinite(v)) return null;
    out.push(v);
  }
  return out;
}
