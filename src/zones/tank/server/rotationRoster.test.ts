import { describe, expect, test } from "bun:test";
import {
  EMPTY_ROTATION_ROSTER,
  pickRotationSlot,
  resolveRotationOrder,
  ROTATION_DEFAULT_INTERVAL_MS,
  ROTATION_MAX_CAMERAS,
  ROTATION_MAX_INTERVAL_MS,
  ROTATION_MIN_INTERVAL_MS,
  sanitizeRotationRoster,
} from "./rotationRoster";

// Every case here decides what a live audience is looking at. The failure modes
// are specific and ugly: a black programme when a rostered camera drops, a
// director frozen on a camera the operator just removed, or a "cut" logged
// every interval for a one-camera spotlight.

describe("sanitizing what arrives over HTTP", () => {
  test("a normal roster survives intact, in the operator's order", () => {
    const roster = sanitizeRotationRoster({ cameraIds: ["b", "a", "c"], intervalMs: 45_000 });
    expect(roster.cameraIds).toEqual(["b", "a", "c"]);
    expect(roster.intervalMs).toBe(45_000);
  });

  test("duplicates are dropped", () => {
    // A repeated id would hold that camera twice a lap, which reads as the
    // rotation being stuck rather than deliberately weighted.
    expect(sanitizeRotationRoster({ cameraIds: ["a", "a", "b"] }).cameraIds).toEqual(["a", "b"]);
  });

  test("junk entries are discarded rather than poisoning the order", () => {
    const roster = sanitizeRotationRoster({ cameraIds: ["a", null, 42, "  ", "b", { id: "c" }] });
    expect(roster.cameraIds).toEqual(["a", "b"]);
  });

  test("the interval is clamped at both ends", () => {
    expect(sanitizeRotationRoster({ intervalMs: 1 }).intervalMs).toBe(ROTATION_MIN_INTERVAL_MS);
    expect(sanitizeRotationRoster({ intervalMs: 9e9 }).intervalMs).toBe(ROTATION_MAX_INTERVAL_MS);
  });

  test("a missing or unusable interval falls back to the default", () => {
    expect(sanitizeRotationRoster({}).intervalMs).toBe(ROTATION_DEFAULT_INTERVAL_MS);
    expect(sanitizeRotationRoster({ intervalMs: "soon" }).intervalMs).toBe(
      ROTATION_DEFAULT_INTERVAL_MS,
    );
    expect(sanitizeRotationRoster({ intervalMs: Number.NaN }).intervalMs).toBe(
      ROTATION_DEFAULT_INTERVAL_MS,
    );
  });

  test("null, undefined and garbage all produce an empty roster, never a throw", () => {
    // This runs on the path that decides what goes on air; it must be total.
    for (const input of [null, undefined, 7, "roster", [], { cameraIds: "a" }]) {
      const roster = sanitizeRotationRoster(input);
      expect(roster.cameraIds).toEqual([]);
      expect(roster.intervalMs).toBe(ROTATION_DEFAULT_INTERVAL_MS);
    }
  });

  test("an absurdly long roster is capped", () => {
    const many = Array.from({ length: 200 }, (_, i) => `cam-${i}`);
    expect(sanitizeRotationRoster({ cameraIds: many }).cameraIds).toHaveLength(
      ROTATION_MAX_CAMERAS,
    );
  });
});

describe("which cameras actually get cycled", () => {
  test("only rostered cameras, in roster order", () => {
    const roster = sanitizeRotationRoster({ cameraIds: ["c", "a"] });
    expect(resolveRotationOrder(roster, ["a", "b", "c"])).toEqual(["c", "a"]);
  });

  test("a rostered camera that went offline is skipped", () => {
    // Rotating onto a dead camera is a black programme.
    const roster = sanitizeRotationRoster({ cameraIds: ["a", "gone", "b"] });
    expect(resolveRotationOrder(roster, ["a", "b"])).toEqual(["a", "b"]);
  });

  test("if EVERY rostered camera is offline, fall back to all live cameras", () => {
    // The important one. An empty rotation holds whatever was last on air
    // forever, which is indistinguishable from a crashed director.
    const roster = sanitizeRotationRoster({ cameraIds: ["gone", "also-gone"] });
    expect(resolveRotationOrder(roster, ["a", "b"])).toEqual(["a", "b"]);
  });

  test("an empty roster means everything, which is the old behaviour", () => {
    expect(resolveRotationOrder(EMPTY_ROTATION_ROSTER, ["a", "b"])).toEqual(["a", "b"]);
  });

  test("no live cameras at all yields nothing to rotate", () => {
    expect(resolveRotationOrder(EMPTY_ROTATION_ROSTER, [])).toEqual([]);
  });
});

describe("choosing the slot", () => {
  const order = ["a", "b", "c"];

  test("holds the shot until the dwell expires", () => {
    const slot = pickRotationSlot({ order, activeCameraId: "a", heldMs: 5_000, intervalMs: 30_000 });
    expect(slot).toEqual({ cameraId: "a", moved: false, dwellSecondsRemaining: 25 });
  });

  test("advances once the dwell expires", () => {
    const slot = pickRotationSlot({ order, activeCameraId: "a", heldMs: 30_000, intervalMs: 30_000 });
    expect(slot?.cameraId).toBe("b");
    expect(slot?.moved).toBe(true);
    expect(slot?.dwellSecondsRemaining).toBe(30);
  });

  test("wraps around the end of the roster", () => {
    const slot = pickRotationSlot({ order, activeCameraId: "c", heldMs: 99_000, intervalMs: 30_000 });
    expect(slot?.cameraId).toBe("a");
  });

  test("a camera not in the roster moves IMMEDIATELY, without serving its dwell", () => {
    // This is what made editing the roster feel like it did nothing: the
    // director sat on the removed camera until the old dwell ran out.
    const slot = pickRotationSlot({ order, activeCameraId: "removed", heldMs: 0, intervalMs: 30_000 });
    expect(slot?.cameraId).toBe("a");
    expect(slot?.moved).toBe(true);
  });

  test("a cold start with no active camera begins at the top of the roster", () => {
    const slot = pickRotationSlot({ order, activeCameraId: null, heldMs: 0, intervalMs: 30_000 });
    expect(slot?.cameraId).toBe("a");
    expect(slot?.moved).toBe(true);
  });

  test("a one-camera roster HOLDS and never announces a cut to itself", () => {
    // A spotlight, not a rotation. Reporting moved:true here would log a cut
    // and fire the CRT transition every interval on an unchanging shot.
    const slot = pickRotationSlot({
      order: ["solo"],
      activeCameraId: "solo",
      heldMs: 999_000,
      intervalMs: 30_000,
    });
    expect(slot).toEqual({ cameraId: "solo", moved: false, dwellSecondsRemaining: 0 });
  });

  test("nothing to rotate returns null rather than inventing a camera", () => {
    expect(
      pickRotationSlot({ order: [], activeCameraId: "a", heldMs: 0, intervalMs: 30_000 }),
    ).toBeNull();
  });

  test("the countdown never goes negative on an overdue shot", () => {
    const slot = pickRotationSlot({
      order: ["solo"],
      activeCameraId: "solo",
      heldMs: 10_000_000,
      intervalMs: 30_000,
    });
    expect(slot?.dwellSecondsRemaining).toBe(0);
  });
});
