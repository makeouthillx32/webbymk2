import { describe, expect, test } from "bun:test";
import {
  competesWith,
  computeLetterbox,
  DETECTED_CLASSES,
  iou,
  MODEL_SIZE,
  nonMaxSuppression,
  normalizedBoxToModelRect,
  NUM_ANCHORS,
  parseYoloOutput,
  rgbaToTensor,
  type Box,
} from "./decode";

// These tests exist because the decoder is hand-written against the raw
// [1,84,8400] tensor — YOLO contributes weights, not decode logic, so every
// bug in here is ours to have. Two of them already bit: dogs reading as cats
// (no argmax, plus same-label-only NMS) and boxes landing in the wrong place
// when the letterbox pad was not undone. Both are pinned below.

const CLASS_INDEX = { person: 0, cat: 15, dog: 16 } as const;

/**
 * Builds a synthetic output0 buffer. Each entry places one object at one
 * anchor slot in padded 640-space, exactly as the model would emit it.
 */
function makeOutput(
  anchors: Array<{
    at: number;
    cx: number;
    cy: number;
    w: number;
    h: number;
    scores: Partial<Record<keyof typeof CLASS_INDEX, number>>;
  }>,
): Float32Array {
  const data = new Float32Array(84 * NUM_ANCHORS);
  for (const a of anchors) {
    data[0 * NUM_ANCHORS + a.at] = a.cx;
    data[1 * NUM_ANCHORS + a.at] = a.cy;
    data[2 * NUM_ANCHORS + a.at] = a.w;
    data[3 * NUM_ANCHORS + a.at] = a.h;
    for (const [name, score] of Object.entries(a.scores)) {
      data[(4 + CLASS_INDEX[name as keyof typeof CLASS_INDEX]) * NUM_ANCHORS + a.at] = score as number;
    }
  }
  return data;
}

const box = (x1: number, y1: number, x2: number, y2: number, score: number, label: string): Box => ({
  x1,
  y1,
  x2,
  y2,
  score,
  label,
});

describe("letterbox geometry", () => {
  test("a 16:9 frame is scaled to fit and padded vertically, never stretched", () => {
    const lb = computeLetterbox(1920, 1080);
    expect(lb.scale).toBeCloseTo(640 / 1920, 6);
    expect(lb.padX).toBe(0);
    // 1080 * (640/1920) = 360, leaving 280px of pad split top and bottom.
    expect(lb.padY).toBe(140);
  });

  test("a square frame needs no padding at all", () => {
    const lb = computeLetterbox(720, 720);
    expect(lb.scale).toBeCloseTo(640 / 720, 6);
    expect(lb.padX).toBe(0);
    expect(lb.padY).toBe(0);
  });

  test("a portrait frame pads horizontally", () => {
    const lb = computeLetterbox(720, 1280);
    expect(lb.scale).toBeCloseTo(0.5, 6);
    expect(lb.padY).toBe(0);
    expect(lb.padX).toBe(140);
  });
});

describe("rgbaToTensor", () => {
  test("interleaved RGBA becomes planar CHW normalized 0-1", () => {
    const plane = MODEL_SIZE * MODEL_SIZE;
    const rgba = new Uint8ClampedArray(plane * 4);
    // Pixel 0 = pure red, pixel 1 = pure green, pixel 2 = half blue.
    rgba[0] = 255;
    rgba[4 + 1] = 255;
    rgba[8 + 2] = 128;

    const t = rgbaToTensor(rgba);
    expect(t.length).toBe(3 * plane);
    expect(t[0]).toBe(1); // R plane, pixel 0
    expect(t[plane + 0]).toBe(0);
    expect(t[plane + 1]).toBe(1); // G plane, pixel 1
    expect(t[2 * plane + 2]).toBeCloseTo(128 / 255, 6); // B plane, pixel 2
  });

  test("alpha is dropped, not folded into a channel", () => {
    const plane = MODEL_SIZE * MODEL_SIZE;
    const rgba = new Uint8ClampedArray(plane * 4);
    rgba[3] = 255; // fully opaque, everything else black
    const t = rgbaToTensor(rgba);
    expect(t[0]).toBe(0);
    expect(t[plane]).toBe(0);
    expect(t[2 * plane]).toBe(0);
  });
});

describe("suppression competition", () => {
  test("a label always competes with itself", () => {
    expect(competesWith("person", "person")).toBe(true);
    expect(competesWith("dog", "dog")).toBe(true);
  });

  test("cat and dog compete — one animal is never both", () => {
    expect(competesWith("cat", "dog")).toBe(true);
    expect(competesWith("dog", "cat")).toBe(true);
  });

  test("person does NOT compete with a pet — someone can hold a dog", () => {
    expect(competesWith("person", "dog")).toBe(false);
    expect(competesWith("cat", "person")).toBe(false);
  });
});

describe("iou", () => {
  test("identical boxes overlap fully", () => {
    expect(iou(box(0, 0, 10, 10, 1, "a"), box(0, 0, 10, 10, 1, "a"))).toBe(1);
  });

  test("disjoint boxes do not overlap", () => {
    expect(iou(box(0, 0, 10, 10, 1, "a"), box(50, 50, 60, 60, 1, "a"))).toBe(0);
  });

  test("degenerate boxes do not divide by zero", () => {
    expect(iou(box(0, 0, 0, 0, 1, "a"), box(0, 0, 0, 0, 1, "a"))).toBe(0);
  });
});

describe("nonMaxSuppression", () => {
  test("a person holding a dog keeps BOTH boxes despite full overlap", () => {
    const kept = nonMaxSuppression([
      box(0, 0, 100, 100, 0.9, "person"),
      box(10, 10, 90, 90, 0.8, "dog"),
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.map((k) => k.label).sort()).toEqual(["dog", "person"]);
  });

  test("a dog also read as a cat resolves to whichever the model believed more", () => {
    const kept = nonMaxSuppression([
      box(0, 0, 100, 100, 0.72, "dog"),
      box(2, 2, 98, 98, 0.41, "cat"),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].label).toBe("dog");
  });

  test("two genuinely separate dogs both survive", () => {
    const kept = nonMaxSuppression([
      box(0, 0, 100, 100, 0.9, "dog"),
      box(400, 400, 500, 500, 0.85, "dog"),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("parseYoloOutput", () => {
  // 1280x720 letterboxed into 640: scale 0.5, padX 0, padY 140.
  const lb = computeLetterbox(1280, 720);

  test("a single confident person decodes to one normalized box", () => {
    const data = makeOutput([{ at: 0, cx: 320, cy: 320, w: 100, h: 200, scores: { person: 0.9 } }]);
    const out = parseYoloOutput(data, lb, 1280, 720);

    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("person");
    expect(out[0].confidence).toBeCloseTo(0.9, 6);

    // Undone by hand: x1 = (320 - 50 - 0) / 0.5 = 540
    //                 y1 = (320 - 100 - 140) / 0.5 = 160
    expect(out[0].nx).toBeCloseTo(540 / 1280, 5);
    expect(out[0].ny).toBeCloseTo(160 / 720, 5);
    expect(out[0].nw).toBeCloseTo(200 / 1280, 5);
    expect(out[0].nh).toBeCloseTo(400 / 720, 5);
  });

  test("one anchor yields ONE label — the argmax, not every class over threshold", () => {
    // The exact shape of the dogs-as-cats bug: one animal scoring high on dog
    // and moderately on cat. Pre-fix this emitted two boxes at identical
    // coordinates and NMS kept both because it only competed same labels.
    const data = makeOutput([
      { at: 7, cx: 320, cy: 320, w: 100, h: 100, scores: { dog: 0.72, cat: 0.61 } },
    ]);
    const out = parseYoloOutput(data, lb, 1280, 720);

    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("dog");
    expect(out[0].confidence).toBeCloseTo(0.72, 6);
  });

  test("anchors below the score floor are dropped", () => {
    const data = makeOutput([{ at: 3, cx: 320, cy: 320, w: 80, h: 80, scores: { person: 0.49 } }]);
    expect(parseYoloOutput(data, lb, 1280, 720)).toHaveLength(0);
  });

  test("an empty tensor yields no detections", () => {
    expect(parseYoloOutput(new Float32Array(84 * NUM_ANCHORS), lb, 1280, 720)).toHaveLength(0);
  });

  test("boxes are clamped into the frame, never negative or past the edge", () => {
    // Deliberately hanging off the top-left of the real frame.
    const data = makeOutput([{ at: 11, cx: 20, cy: 150, w: 200, h: 200, scores: { person: 0.8 } }]);
    const out = parseYoloOutput(data, lb, 1280, 720);
    expect(out).toHaveLength(1);
    expect(out[0].nx).toBeGreaterThanOrEqual(0);
    expect(out[0].ny).toBeGreaterThanOrEqual(0);
    expect(out[0].nx + out[0].nw).toBeLessThanOrEqual(1.000001);
    expect(out[0].ny + out[0].nh).toBeLessThanOrEqual(1.000001);
  });

  test("classes outside the watched set are ignored entirely", () => {
    // Channel 4+2 is COCO 'car'. Reading it would put cars in the people count.
    const data = new Float32Array(84 * NUM_ANCHORS);
    data[0 * NUM_ANCHORS + 5] = 320;
    data[1 * NUM_ANCHORS + 5] = 320;
    data[2 * NUM_ANCHORS + 5] = 100;
    data[3 * NUM_ANCHORS + 5] = 100;
    data[(4 + 2) * NUM_ANCHORS + 5] = 0.99;

    expect(parseYoloOutput(data, lb, 1280, 720)).toHaveLength(0);
    expect(
      Object.keys(DETECTED_CLASSES)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual([0, 15, 16]);
  });

  test("a crowded frame is capped rather than flooding the director", () => {
    const anchors = Array.from({ length: 60 }, (_, i) => ({
      at: i * 100,
      // Spread them apart so NMS keeps every one; only the cap should bite.
      cx: 40 + (i % 15) * 40,
      cy: 160 + Math.floor(i / 15) * 40,
      w: 20,
      h: 20,
      scores: { person: 0.6 + (i % 10) * 0.01 },
    }));
    const out = parseYoloOutput(makeOutput(anchors), lb, 1280, 720);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("normalizedBoxToModelRect", () => {
  // The return journey. A detection leaves the decoder in source-frame
  // fractions, but the only pixels still in memory are the padded 640 buffer
  // the model was fed, so anything that wants to LOOK at a detection (an
  // appearance signature, an enrolment crop, a saved thumbnail) has to get back
  // through the same scale and padding.
  //
  // The failure mode is silent, which is why it is pinned: a crop that is off
  // by the pad reads a band of black letterbox plus part of a body, produces a
  // perfectly well-formed signature, and simply never matches anybody. It looks
  // exactly like "nobody is enrolled".

  test("a decoded box maps back onto the padded coordinates it came from", () => {
    const lb = computeLetterbox(1280, 720);
    const data = makeOutput([{ at: 0, cx: 320, cy: 320, w: 100, h: 200, scores: { person: 0.9 } }]);
    const [box] = parseYoloOutput(data, lb, 1280, 720);

    const rect = normalizedBoxToModelRect(box, lb, 1280, 720);

    // Straight back to the model-space box the tensor described: cx 320, w 100
    // means x 270..370; cy 320, h 200 means y 220..420.
    expect(rect.x).toBeCloseTo(270, 3);
    expect(rect.y).toBeCloseTo(220, 3);
    expect(rect.w).toBeCloseTo(100, 3);
    expect(rect.h).toBeCloseTo(200, 3);
  });

  test("the vertical pad is added back, not ignored", () => {
    // A box at the very top of a 16:9 SOURCE frame sits at y=140 in the padded
    // buffer, because the top 140 rows are black bar. Dropping padY here is the
    // whole bug: every crop in the house would be shifted up into the letterbox.
    const lb = computeLetterbox(1920, 1080);
    const rect = normalizedBoxToModelRect(
      { nx: 0, ny: 0, nw: 0.1, nh: 0.1 },
      lb,
      1920,
      1080,
    );
    expect(rect.y).toBeCloseTo(140, 3);
    expect(rect.x).toBeCloseTo(0, 3);
  });

  test("a portrait frame gets its horizontal pad back instead", () => {
    const lb = computeLetterbox(720, 1280);
    const rect = normalizedBoxToModelRect({ nx: 0, ny: 0, nw: 0.5, nh: 0.5 }, lb, 720, 1280);
    expect(rect.x).toBeCloseTo(140, 3);
    expect(rect.y).toBeCloseTo(0, 3);
    // 720 * 0.5 scale * 0.5 of the frame = 180px wide in model space.
    expect(rect.w).toBeCloseTo(180, 3);
  });

  test("a full-frame box covers the whole scaled image and nothing more", () => {
    const lb = computeLetterbox(1280, 720);
    const rect = normalizedBoxToModelRect({ nx: 0, ny: 0, nw: 1, nh: 1 }, lb, 1280, 720);
    expect(rect.x).toBe(0);
    expect(rect.w).toBeCloseTo(640, 3);
    expect(rect.y).toBeCloseTo(lb.padY, 3);
    expect(rect.h).toBeCloseTo(360, 3);
    // It must not spill into the pad: the image is 360 tall inside a 640 box.
    expect(rect.y + rect.h).toBeLessThanOrEqual(MODEL_SIZE);
  });
});
