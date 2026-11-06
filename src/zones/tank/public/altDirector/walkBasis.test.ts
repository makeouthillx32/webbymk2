import { describe, expect, test } from "bun:test";
import { BASIS_GRACE_S, holdBasis, type BasisHold } from "./walkBasis";

const hall = { fx: 0, fz: 1 }; // the camera you walked in under
const room = { fx: 0, fz: -1 }; // the next room's camera, facing back at you
const empty: BasisHold = { basis: null, input: null, until: 0 };

describe("holdBasis", () => {
  test("a cut mid-stride keeps 'up' walking the same way", () => {
    let hold = holdBasis(empty, hall, 1, 0, true, 0);
    expect(hold.basis).toEqual(hall);
    hold = holdBasis(hold, room, 1, 0, true, 0.1);
    expect(hold.basis).toEqual(hall);
    // A little steering is still the same push.
    hold = holdBasis(hold, room, 0.9, 0.3, true, 0.2);
    expect(hold.basis).toEqual(hall);
  });

  test("steering somewhere new follows the camera on screen", () => {
    let hold = holdBasis(empty, hall, 1, 0, true, 0);
    hold = holdBasis(hold, room, 1, 0, true, 0.1);
    // Bumped into the door frame, the player pushes left: left on this screen.
    hold = holdBasis(hold, room, 0, -1, true, 0.2);
    expect(hold.basis).toEqual(room);
    expect(hold.input).toEqual([0, -1]);
  });

  test("a short let-go keeps the old way for the same push, not a new one", () => {
    let hold = holdBasis(empty, hall, 1, 0, true, 0);
    hold = holdBasis(hold, room, 0, 0, false, 0.5);
    expect(hold.basis).toEqual(hall);
    expect(holdBasis(hold, room, 1, 0, true, 0.6).basis).toEqual(hall);
    expect(holdBasis(hold, room, -1, 0, true, 0.6).basis).toEqual(room);
  });

  test("after the grace, standing still takes the camera on screen", () => {
    let hold = holdBasis(empty, hall, 1, 0, true, 0);
    hold = holdBasis(hold, room, 0, 0, false, BASIS_GRACE_S + 0.01);
    expect(hold.basis).toEqual(room);
    expect(hold.input).toBeNull();
    expect(holdBasis(hold, room, 1, 0, true, 2).basis).toEqual(room);
  });
});
