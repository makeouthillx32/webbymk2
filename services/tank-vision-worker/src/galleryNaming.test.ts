import { describe, expect, test } from "bun:test";
import {
  CONFIDENT_MARGIN,
  applyLook,
  cropToTensor,
  exclusiveNames,
  recall,
  scoreEmbedding,
  type GalleryPack,
  type Remembered,
} from "./galleryNaming";

const unit = (...v: number[]) => {
  const n = Math.hypot(...v);
  return new Float32Array(v.map((x) => x / n));
};

/** Three people in 3-d, a rack as the negative. */
function pack(): GalleryPack {
  const rows = [
    ["tyler", unit(1, 0, 0)], ["tyler", unit(0.98, 0.1, 0)],
    ["malia", unit(0, 1, 0)], ["malia", unit(0.1, 0.98, 0)],
    ["joe", unit(0, 0, 1)], ["joe", unit(0, 0.1, 0.98)],
  ] as const;
  const mat = new Float32Array(rows.length * 3);
  rows.forEach(([, v], i) => mat.set(v, i * 3));
  return {
    dims: 3,
    names: rows.map(([n]) => n),
    mat,
    negatives: unit(0.6, 0.6, 0.53),
    negativeRows: 1,
    classifier: null,
    loadedFrom: 0,
  };
}

describe("scoreEmbedding", () => {
  test("a clear look is named", () => {
    const v = scoreEmbedding(pack(), unit(1, 0.05, 0));
    expect(v.best).toBe("tyler");
    expect(v.margin).toBeGreaterThan(CONFIDENT_MARGIN);
    expect(v.name).toBe("tyler");
  });

  test("a look between two people is not named", () => {
    const v = scoreEmbedding(pack(), unit(1, 0.97, 0));
    expect(v.name).toBeNull();
  });

  test("the rack is hidden, not named", () => {
    const v = scoreEmbedding(pack(), unit(0.6, 0.6, 0.53));
    expect(v.notAPerson).toBe(true);
    expect(v.name).toBeNull();
  });
});

describe("applyLook: names are earned, then kept", () => {
  const look = (best: string, margin: number) => ({ name: null, best, margin, notAPerson: false });

  test("three narrow wins in a row earn Malia her name (her desk case)", () => {
    const entry: Remembered = { box: { nx: 0, ny: 0, nw: 1, nh: 1 }, verdict: null, checkedAt: 0, pending: false };
    expect(applyLook(entry, look("malia", 0.03)).name).toBeNull();
    expect(applyLook(entry, look("malia", 0.04)).name).toBeNull();
    expect(applyLook(entry, look("malia", 0.035)).name).toBe("malia");
  });

  test("one bad angle does not un-name, three losses in a row do", () => {
    const entry: Remembered = { box: { nx: 0, ny: 0, nw: 1, nh: 1 }, verdict: null, checkedAt: 0, pending: false };
    applyLook(entry, look("tyler", 0.1));
    expect(applyLook(entry, look("joe", 0.01)).name).toBe("tyler");
    expect(applyLook(entry, look("joe", 0.01)).name).toBe("tyler");
    expect(applyLook(entry, look("joe", 0.01)).name).toBeNull();
  });
});

describe("memory and one name per camera", () => {
  test("a box where a remembered body stood is that body", () => {
    const mem: Remembered[] = [{ box: { nx: 0.4, ny: 0.3, nw: 0.1, nh: 0.4 }, verdict: null, checkedAt: 1000, pending: false }];
    expect(recall(mem, { nx: 0.41, ny: 0.31, nw: 0.1, nh: 0.4 }, 2000)).toBe(mem[0]);
    expect(recall(mem, { nx: 0.8, ny: 0.3, nw: 0.1, nh: 0.4 }, 2000)).toBeNull();
    // Still remembered when the round-robin comes back to this camera (~12 s later)…
    expect(recall(mem, { nx: 0.41, ny: 0.31, nw: 0.1, nh: 0.4 }, 14_000)).toBe(mem[0]);
    // …but not forever.
    expect(recall(mem, { nx: 0.41, ny: 0.31, nw: 0.1, nh: 0.4 }, 60_000)).toBeNull();
  });

  test("two bodies claiming Tyler: the clearer claim keeps it", () => {
    const out = exclusiveNames([
      { index: 0, verdict: { name: "tyler", best: "tyler", margin: 0.07, notAPerson: false } },
      { index: 1, verdict: { name: "tyler", best: "tyler", margin: 0.12, notAPerson: false } },
    ]);
    expect(out.get(1)?.name).toBe("tyler");
    expect(out.get(0)?.name).toBeNull();
  });
});

describe("cropToTensor", () => {
  test("shapes a crop to OSNet's 3x256x128 input and refuses a smudge", () => {
    const frame = new Uint8Array(64 * 64 * 4).fill(128);
    expect(cropToTensor(frame, 64, 64, { x: 10, y: 5, w: 20, h: 50 })?.length).toBe(3 * 256 * 128);
    expect(cropToTensor(frame, 64, 64, { x: 10, y: 5, w: 20, h: 10 })).toBeNull();
  });
});
