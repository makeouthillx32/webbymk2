import { describe, expect, test } from "bun:test";
import {
  assignAppearances,
  BANDS,
  buildAppearanceSignature,
  matchAppearance,
  SIGNATURE_LENGTH,
  similarity,
  type AppearanceSignature,
  type CropSource,
} from "./appearance";

// This module exists because rooms were never evidence of identity (see
// detectionCatalog). Appearance is the only signal left that actually separates
// one person from another, so these tests care far more about WHEN IT DECLINES
// than about when it matches: a wrong name on screen teaches the operator to
// distrust every label, which is worse than no name at all.

/** Build a frame painted as horizontal bands of flat colour. */
function frameWithBands(
  width: number,
  height: number,
  bands: Array<[number, number, number]>,
): CropSource {
  const rgba = new Uint8Array(width * height * 4);
  const bandHeight = height / bands.length;
  for (let y = 0; y < height; y++) {
    const [r, g, b] = bands[Math.min(bands.length - 1, Math.floor(y / bandHeight))];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 255;
    }
  }
  return { rgba, width, height };
}

const WHITE: [number, number, number] = [250, 250, 250];
const BLACK: [number, number, number] = [8, 8, 8];
const RED: [number, number, number] = [220, 30, 30];
const BLUE: [number, number, number] = [30, 40, 220];

describe("a signature describes the body top-to-bottom", () => {
  test("pale-over-dark is not the same vector as dark-over-pale", () => {
    // The entire premise in one assertion. If the bands were pooled into a
    // single histogram, these two people would be identical — same pixels, same
    // colours, opposite arrangement — and the matcher could never separate
    // someone in a white tee and dark jeans from the inverse.
    const paleTop = frameWithBands(40, 80, [WHITE, WHITE, BLACK, BLACK]);
    const darkTop = frameWithBands(40, 80, [BLACK, BLACK, WHITE, WHITE]);

    const a = buildAppearanceSignature(paleTop, { x: 0, y: 0, w: 40, h: 80 })!;
    const b = buildAppearanceSignature(darkTop, { x: 0, y: 0, w: 40, h: 80 })!;

    expect(a).not.toBeNull();
    expect(a.length).toBe(SIGNATURE_LENGTH);
    expect(similarity(a, b)).toBeLessThan(0.1);
  });

  test("the same person further from the camera still matches themselves", () => {
    // Normalisation is per band, so a person filling 160px of frame and the
    // same person filling 80px produce the same vector. Without this, distance
    // from the lens would read as a different identity and the whole thing
    // would only work at one spot in the room.
    const near = frameWithBands(80, 160, [WHITE, RED, BLUE, BLACK]);
    const far = frameWithBands(40, 80, [WHITE, RED, BLUE, BLACK]);

    const a = buildAppearanceSignature(near, { x: 0, y: 0, w: 80, h: 160 })!;
    const b = buildAppearanceSignature(far, { x: 0, y: 0, w: 40, h: 80 })!;

    expect(similarity(a, b)).toBeGreaterThan(0.99);
  });

  test("an identical crop scores exactly 1, never above it", () => {
    const frame = frameWithBands(40, 80, [RED, BLUE, WHITE, BLACK]);
    const sig = buildAppearanceSignature(frame, { x: 0, y: 0, w: 40, h: 80 })!;
    expect(similarity(sig, sig)).toBe(1);
  });

  test("a crop is read from its own rectangle, not the whole frame", () => {
    // Two people in one frame must produce two different signatures. If the
    // rect were ignored, every box in a room would match every other one.
    const frame = frameWithBands(40, 160, [WHITE, WHITE, BLACK, BLACK]);
    const topHalf = buildAppearanceSignature(frame, { x: 0, y: 0, w: 40, h: 80 })!;
    const bottomHalf = buildAppearanceSignature(frame, { x: 0, y: 80, w: 40, h: 80 })!;
    expect(similarity(topHalf, bottomHalf)).toBeLessThan(0.1);
  });
});

describe("it declines rather than inventing a signature", () => {
  test("a distant smudge produces nothing at all", () => {
    // A 10x20 blob at the back of the game room carries no clothing
    // information, but it WOULD produce a vector that matches almost anyone.
    // Returning null is what keeps that box unnamed.
    const frame = frameWithBands(10, 20, [RED, RED, BLUE, BLUE]);
    expect(buildAppearanceSignature(frame, { x: 0, y: 0, w: 10, h: 20 })).toBeNull();
  });

  test("a box shorter than the band count produces nothing", () => {
    const frame = frameWithBands(200, 200, [RED, BLUE, WHITE, BLACK]);
    expect(buildAppearanceSignature(frame, { x: 0, y: 0, w: 200, h: BANDS - 1 })).toBeNull();
  });

  test("a box running off the edge of the frame is clipped, not read out of bounds", () => {
    const frame = frameWithBands(40, 80, [WHITE, WHITE, BLACK, BLACK]);
    // Someone half out of shot at the right edge.
    const sig = buildAppearanceSignature(frame, { x: 20, y: 0, w: 60, h: 80 });
    expect(sig).not.toBeNull();
    expect(sig!.every((v) => Number.isFinite(v))).toBe(true);
  });

  test("mismatched vector lengths score zero instead of throwing", () => {
    expect(similarity([1, 0, 0], [1, 0])).toBe(0);
    expect(similarity([], [])).toBe(0);
  });
});

// ── The matcher ─────────────────────────────────────────────────────────────
// Built from vectors directly rather than from pixels: the question here is the
// arbitration policy, and hand-built vectors let the margins be exact.

function unitAt(index: number): AppearanceSignature {
  const v = new Array<number>(SIGNATURE_LENGTH).fill(0);
  v[index] = 1;
  return v;
}

/** A vector `mix` of the way from one axis toward another. */
function blend(indexA: number, indexB: number, mix: number): AppearanceSignature {
  const v = new Array<number>(SIGNATURE_LENGTH).fill(0);
  v[indexA] = 1 - mix;
  v[indexB] = mix;
  return v;
}

describe("the matcher names a person only when the evidence separates them", () => {
  test("a clear match is named", () => {
    const match = matchAppearance(unitAt(0), [
      { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
      { slug: "malia", displayName: "MALIA", signatures: [unitAt(5)] },
    ]);
    expect(match?.slug).toBe("tyler");
    expect(match?.score).toBe(1);
  });

  test("two housemates dressed alike are BOTH declined", () => {
    // The failure this gate exists for. Tyler and Joe in dark hoodies score
    // 0.99 and 0.98 against the probe; whichever wins is decided by sensor
    // noise, so the on-screen name flips between two real people frame to
    // frame. Refusing is the only honest output.
    const probe = unitAt(0);
    const nearlyIdentical = blend(0, 1, 0.02);

    const match = matchAppearance(probe, [
      { slug: "tyler", displayName: "TYLER", signatures: [probe] },
      { slug: "joe", displayName: "JOE", signatures: [nearlyIdentical] },
    ]);
    expect(match).toBeNull();
  });

  test("a stranger matches nobody", () => {
    // A guest who was never enrolled, or a housemate in an outfit that post
    // dates their enrolment. Both must come out unnamed.
    const match = matchAppearance(unitAt(9), [
      { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
      { slug: "malia", displayName: "MALIA", signatures: [unitAt(5)] },
    ]);
    expect(match).toBeNull();
  });

  test("one enrolled person still has to actually look like themselves", () => {
    // With a single enrolment there is no runner-up, so the margin gate cannot
    // fire. If minScore were not independently enforced, the sole enrolled
    // person would be stamped on every body that walked past.
    const enrolled = [{ slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] }];
    expect(matchAppearance(unitAt(9), enrolled)).toBeNull();
    expect(matchAppearance(unitAt(0), enrolled)?.slug).toBe("tyler");
  });

  test("the best of several references wins, so one bad capture cannot sink a person", () => {
    // People are enrolled from several frames. A reference taken while someone
    // was half out of shot should be ignored, not averaged in.
    const match = matchAppearance(unitAt(3), [
      { slug: "malia", displayName: "MALIA", signatures: [unitAt(7), unitAt(3), unitAt(9)] },
    ]);
    expect(match?.slug).toBe("malia");
    expect(match?.score).toBe(1);
  });

  test("nobody enrolled means nobody named", () => {
    expect(matchAppearance(unitAt(0), [])).toBeNull();
  });

  test("the reported margin is the real distance to the runner-up", () => {
    // Surfaced to the operator so a marginal identification is visible as one
    // rather than looking identical to a confident one.
    const match = matchAppearance(unitAt(0), [
      { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
      { slug: "malia", displayName: "MALIA", signatures: [blend(0, 1, 0.5)] },
    ]);
    expect(match?.slug).toBe("tyler");
    // blend(0,1,0.5) sits at 45 degrees to the probe: cos = 0.7071.
    expect(match!.margin).toBeCloseTo(1 - Math.SQRT1_2, 3);
  });

  test("ties break deterministically, never by array order luck", () => {
    // Two identical enrolments would otherwise pick whoever the sort happened
    // to leave first, so the same frame could name a different person on
    // different runs. They are declined on margin anyway; this pins that the
    // ordering itself is stable.
    const a = matchAppearance(unitAt(0), [
      { slug: "zed", displayName: "ZED", signatures: [unitAt(0)] },
      { slug: "amy", displayName: "AMY", signatures: [unitAt(0)] },
    ]);
    const b = matchAppearance(unitAt(0), [
      { slug: "amy", displayName: "AMY", signatures: [unitAt(0)] },
      { slug: "zed", displayName: "ZED", signatures: [unitAt(0)] },
    ]);
    expect(a).toEqual(b);
  });
});

describe("one identity per frame", () => {
  test("two bodies cannot both be Tyler", () => {
    // The duplicate-name failure. Both boxes claim TYLER; only the stronger
    // claim keeps him, and the other is left unnamed rather than being handed
    // the person it already failed the margin gate against.
    const enrolled = [
      { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
      { slug: "malia", displayName: "MALIA", signatures: [unitAt(5)] },
    ];
    const assigned = assignAppearances(
      [
        { key: "box-a", signature: unitAt(0) },
        { key: "box-b", signature: blend(0, 2, 0.1) },
      ],
      enrolled,
    );

    expect(assigned.get("box-a")?.slug).toBe("tyler");
    expect(assigned.has("box-b")).toBe(false);
    expect([...assigned.values()].map((m) => m.slug)).toEqual(["tyler"]);
  });

  test("different people are named simultaneously", () => {
    const assigned = assignAppearances(
      [
        { key: "box-a", signature: unitAt(0) },
        { key: "box-b", signature: unitAt(5) },
      ],
      [
        { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
        { slug: "malia", displayName: "MALIA", signatures: [unitAt(5)] },
      ],
    );
    expect(assigned.get("box-a")?.slug).toBe("tyler");
    expect(assigned.get("box-b")?.slug).toBe("malia");
  });

  test("a box with no usable signature is skipped, not guessed at", () => {
    // buildAppearanceSignature returns null for a crop too small to read. That
    // box must stay anonymous rather than inheriting whoever is left over.
    const assigned = assignAppearances(
      [
        { key: "near", signature: unitAt(0) },
        { key: "far", signature: null },
      ],
      [
        { slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] },
        { slug: "malia", displayName: "MALIA", signatures: [unitAt(5)] },
      ],
    );
    expect(assigned.get("near")?.slug).toBe("tyler");
    expect(assigned.has("far")).toBe(false);
  });

  test("an empty frame names nobody", () => {
    expect(assignAppearances([], [{ slug: "tyler", displayName: "T", signatures: [unitAt(0)] }]).size).toBe(0);
  });

  test("assignment is stable when two boxes tie exactly", () => {
    // Identical signatures on both boxes: whichever wins, it must be the same
    // one on every pass, or the name would jump between two bodies while
    // neither of them moved.
    const enrolled = [{ slug: "tyler", displayName: "TYLER", signatures: [unitAt(0)] }];
    const first = assignAppearances(
      [
        { key: "box-a", signature: unitAt(0) },
        { key: "box-b", signature: unitAt(0) },
      ],
      enrolled,
    );
    const second = assignAppearances(
      [
        { key: "box-b", signature: unitAt(0) },
        { key: "box-a", signature: unitAt(0) },
      ],
      enrolled,
    );
    expect(first.size).toBe(1);
    expect([...first.keys()]).toEqual([...second.keys()]);
  });
});
