// Which way "up" walks under fixed cameras.
//
// Input is screen-relative: forward = away from the camera. When a doorway
// cuts to the next room's camera mid-stride, re-reading the camera at once
// flips the walker round (the classic fixed-camera trap), so the old
// mapping is held for as long as the player keeps pushing the same way,
// and through a short pause too. The hold ends the moment the player
// steers somewhere new: by then they are steering by what they see, so
// left has to be left on the screen in front of them. Holding the old
// mapping past that point is what sent walkers backwards out of doors.

export type Basis = { fx: number; fz: number };

export type BasisHold = {
  /** The camera facing on the ground that the input is mapped through. */
  basis: Basis | null;
  /** The input direction (forward, right) the hold was taken for. */
  input: [number, number] | null;
  /** While not moving, the hold lasts until then. */
  until: number;
};

/** How long a let-go keeps the old mapping (press the same way again and it carries on). */
export const BASIS_GRACE_S = 1;

/** Steering further than this from the held direction re-reads the camera. */
export const BASIS_TURN_RAD = (50 * Math.PI) / 180;

const COS_TURN = Math.cos(BASIS_TURN_RAD);

/**
 * The next hold, given the live camera's facing on the ground and this
 * frame's input. `moving` is whether the input is past its dead zone.
 */
export function holdBasis(
  hold: BasisHold,
  camera: Basis,
  forward: number,
  right: number,
  moving: boolean,
  now: number,
): BasisHold {
  if (!moving) {
    if (!hold.basis || now >= hold.until) return { basis: camera, input: null, until: hold.until };
    return hold;
  }
  const until = now + BASIS_GRACE_S;
  const amount = Math.hypot(forward, right) || 1;
  const input: [number, number] = [forward / amount, right / amount];
  if (!hold.basis || !hold.input) return { basis: hold.basis ?? camera, input, until };
  const same = hold.input[0] * input[0] + hold.input[1] * input[1];
  if (same < COS_TURN) return { basis: camera, input, until };
  return { basis: hold.basis, input: hold.input, until };
}
