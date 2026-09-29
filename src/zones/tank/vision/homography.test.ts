import { describe, expect, test } from "bun:test";
import {
  applyHomography,
  groundContactPoint,
  invertHomography,
  solveHomography,
  type Correspondence,
  type Homography,
} from "./homography";

// Everything downstream — durable track IDs, cross-camera identity, the whole
// point of calibration — sits on this matrix being right. A wrong homography
// does not error, it just puts people in the wrong room, so the tests below
// check actual geometry rather than "it returned something".

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

/** A camera looking straight down at a 4m x 3m room, image 0..1 -> metres. */
const OVERHEAD: Correspondence[] = [
  { image: { x: 0, y: 0 }, floor: { x: 0, y: 0 } },
  { image: { x: 1, y: 0 }, floor: { x: 4, y: 0 } },
  { image: { x: 1, y: 1 }, floor: { x: 4, y: 3 } },
  { image: { x: 0, y: 1 }, floor: { x: 0, y: 3 } },
];

/**
 * A camera at floor level looking across the room: the far edge is squeezed
 * into the top of the frame, which is what perspective actually does and what a
 * pure scale-and-offset cannot represent.
 */
const PERSPECTIVE: Correspondence[] = [
  { image: { x: 0.3, y: 0.4 }, floor: { x: 0, y: 6 } }, // far-left
  { image: { x: 0.7, y: 0.4 }, floor: { x: 4, y: 6 } }, // far-right
  { image: { x: 0.95, y: 1.0 }, floor: { x: 4, y: 0 } }, // near-right
  { image: { x: 0.05, y: 1.0 }, floor: { x: 0, y: 0 } }, // near-left
];

describe("solveHomography", () => {
  test("an overhead camera maps the image square onto the room rectangle", () => {
    const h = solveHomography(OVERHEAD);
    expect(h).not.toBeNull();
    const centre = applyHomography(h!, { x: 0.5, y: 0.5 });
    expect(near(centre!.x, 2)).toBe(true);
    expect(near(centre!.y, 1.5)).toBe(true);
  });

  test("it reproduces every point it was fitted to", () => {
    for (const set of [OVERHEAD, PERSPECTIVE]) {
      const h = solveHomography(set)!;
      expect(h).not.toBeNull();
      for (const { image, floor } of set) {
        const p = applyHomography(h, image)!;
        expect(near(p.x, floor.x)).toBe(true);
        expect(near(p.y, floor.y)).toBe(true);
      }
    }
  });

  test("perspective is genuinely non-linear — the midpoint is NOT the average", () => {
    // The real test that this is a homography and not a scale+offset.
    //
    // Note the axis inverts: image y=0.4 is the FAR edge (floor y=6) and y=1.0
    // is the NEAR edge (floor y=0). So image y=0.7 sits in the near half of the
    // frame, and the near half of a perspective image covers LESS ground than
    // half the room — foreshortening packs the far distance into few pixels.
    // A linear map would say 3.0; the correct answer is well under it.
    const h = solveHomography(PERSPECTIVE)!;
    const mid = applyHomography(h, { x: 0.5, y: 0.7 })!;
    expect(mid.y).toBeLessThan(3);
    expect(mid.y).toBeGreaterThan(0);
  });

  test("two cameras with different views agree on the same floor point", () => {
    // The entire purpose of calibration: one physical location, two cameras,
    // one floor coordinate.
    const overhead = solveHomography(OVERHEAD)!;
    const angled = solveHomography([
      { image: { x: 0, y: 0 }, floor: { x: 0, y: 3 } },
      { image: { x: 1, y: 0 }, floor: { x: 0, y: 0 } },
      { image: { x: 1, y: 1 }, floor: { x: 4, y: 0 } },
      { image: { x: 0, y: 1 }, floor: { x: 4, y: 3 } },
    ])!;

    const fromOverhead = applyHomography(overhead, { x: 0.25, y: 1 / 3 })!; // -> (1, 1)
    // This camera is rotated 90 degrees: floor X = 4v, floor Y = 3(1 - u).
    // So floor (1, 1) sits at image u = 2/3, v = 0.25.
    const fromAngled = applyHomography(angled, { x: 2 / 3, y: 0.25 })!; // -> (1, 1)

    expect(near(fromOverhead.x, 1, 1e-6)).toBe(true);
    expect(near(fromOverhead.y, 1, 1e-6)).toBe(true);
    expect(near(fromAngled.x, fromOverhead.x, 1e-6)).toBe(true);
    expect(near(fromAngled.y, fromOverhead.y, 1e-6)).toBe(true);
  });
});

describe("solveHomography rejects bad calibration instead of poisoning tracks", () => {
  test("fewer or more than four points", () => {
    expect(solveHomography(OVERHEAD.slice(0, 3))).toBeNull();
    expect(solveHomography([...OVERHEAD, OVERHEAD[0]])).toBeNull();
  });

  test("all four image points collinear — clicking along a wall edge", () => {
    const collinear: Correspondence[] = [
      { image: { x: 0, y: 0.5 }, floor: { x: 0, y: 0 } },
      { image: { x: 0.3, y: 0.5 }, floor: { x: 1, y: 0 } },
      { image: { x: 0.6, y: 0.5 }, floor: { x: 2, y: 0 } },
      { image: { x: 0.9, y: 0.5 }, floor: { x: 3, y: 0 } },
    ];
    expect(solveHomography(collinear)).toBeNull();
  });

  test("duplicated points", () => {
    const dup = [OVERHEAD[0], OVERHEAD[0], OVERHEAD[1], OVERHEAD[2]];
    expect(solveHomography(dup)).toBeNull();
  });

  test("non-finite input never yields a matrix", () => {
    const bad: Correspondence[] = [
      { image: { x: Number.NaN, y: 0 }, floor: { x: 0, y: 0 } },
      ...OVERHEAD.slice(1),
    ];
    expect(solveHomography(bad)).toBeNull();
  });
});

describe("applyHomography", () => {
  test("a point on the horizon has no floor position, and says so", () => {
    // w -> 0 means "infinitely far away on the floor plane". Returning a huge
    // number here would drop a phantom track kilometres from the house.
    const h: Homography = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 1, 0],
    ];
    expect(applyHomography(h, { x: 0.5, y: 0 })).toBeNull();
  });

  test("points outside the calibrated quad still project — extrapolation is allowed", () => {
    // Deliberate: a person half a step past the rug is still somewhere real.
    // Rejecting out-of-quad points would make tracks blink at the edges.
    const h = solveHomography(OVERHEAD)!;
    const outside = applyHomography(h, { x: 1.1, y: 1.1 })!;
    expect(outside.x).toBeGreaterThan(4);
    expect(outside.y).toBeGreaterThan(3);
  });
});

describe("invertHomography", () => {
  test("round-trips image -> floor -> image", () => {
    const h = solveHomography(PERSPECTIVE)!;
    const back = invertHomography(h)!;
    expect(back).not.toBeNull();

    for (const probe of [
      { x: 0.5, y: 0.8 },
      { x: 0.2, y: 0.6 },
      { x: 0.85, y: 0.95 },
    ]) {
      const floor = applyHomography(h, probe)!;
      const image = applyHomography(back, floor)!;
      expect(near(image.x, probe.x, 1e-6)).toBe(true);
      expect(near(image.y, probe.y, 1e-6)).toBe(true);
    }
  });

  test("a singular matrix cannot be inverted", () => {
    const singular: Homography = [
      [1, 2, 3],
      [2, 4, 6],
      [0, 0, 1],
    ];
    expect(invertHomography(singular)).toBeNull();
  });
});

describe("groundContactPoint", () => {
  test("it is the bottom-centre of the box — where feet meet the floor", () => {
    const p = groundContactPoint({ nx: 0.4, ny: 0.2, nw: 0.2, nh: 0.6 });
    expect(p.x).toBeCloseTo(0.5, 9);
    expect(p.y).toBeCloseTo(0.8, 9);
  });

  test("it is NOT the box centre — that is the mistake this exists to prevent", () => {
    const box = { nx: 0.4, ny: 0.2, nw: 0.2, nh: 0.6 };
    const contact = groundContactPoint(box);
    const centre = { x: box.nx + box.nw / 2, y: box.ny + box.nh / 2 };
    expect(contact.y).toBeGreaterThan(centre.y);
  });

  test("a taller box (closer person) still contacts at its own base", () => {
    expect(groundContactPoint({ nx: 0, ny: 0, nw: 1, nh: 1 }).y).toBe(1);
    expect(groundContactPoint({ nx: 0.1, ny: 0.5, nw: 0.1, nh: 0.2 }).y).toBeCloseTo(0.7, 9);
  });
});
