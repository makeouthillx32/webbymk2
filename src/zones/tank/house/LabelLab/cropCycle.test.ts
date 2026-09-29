import { describe, expect, test } from "bun:test";
import { cropBadge, cycleOrder, nextCropState, type CropTarget } from "./cropCycle";

const targets: CropTarget[] = [
  { slug: "molly", displayName: "MOLLY", cls: "dog", guest: false },
  { slug: "tyler", displayName: "TYLER", cls: "person", guest: false },
  { slug: "malia", displayName: "MALIA", cls: "person", guest: false },
  { slug: "guest-andy", displayName: "Andy", cls: "person", guest: true },
];

describe("crop click cycle", () => {
  test("offers people first, then animals, then guests", () => {
    expect(cycleOrder(targets).map((t) => t.slug)).toEqual(["tyler", "malia", "molly", "guest-andy"]);
  });

  test("clicks walk strike -> each name -> back to normal", () => {
    let state = { rejected: false, slug: null as string | null };
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: true, slug: null });
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: false, slug: "tyler" });
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: false, slug: "malia" });
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: false, slug: "molly" });
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: false, slug: "guest-andy" });
    // Round trip: the last click hands the crop back to its group.
    state = nextCropState(state, targets);
    expect(state).toEqual({ rejected: false, slug: null });
  });

  test("a name that is no longer offered releases the crop instead of trapping it", () => {
    expect(nextCropState({ rejected: false, slug: "guest-gone" }, targets)).toEqual({ rejected: false, slug: null });
  });

  test("with nobody to assign, a struck crop just comes back", () => {
    expect(nextCropState({ rejected: true, slug: null }, [])).toEqual({ rejected: false, slug: null });
  });

  test("the badge names the crop's own owner, and says nothing otherwise", () => {
    expect(cropBadge({ rejected: false, slug: "malia" }, targets)).toBe("MALIA");
    expect(cropBadge({ rejected: false, slug: null }, targets)).toBeNull();
    expect(cropBadge({ rejected: true, slug: null }, targets)).toBeNull();
  });
});
