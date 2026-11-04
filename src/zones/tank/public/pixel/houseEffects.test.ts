import { describe, expect, test } from "bun:test";
import { HOUSE_EFFECTS, bakeEffect } from "./houseEffects";
import { PixelFrame, bayer } from "./pixelFrame";

const alphaSum = (frame: Uint8ClampedArray) => {
  let sum = 0;
  for (let i = 3; i < frame.length; i += 4) sum += frame[i];
  return sum;
};

describe("house pixel effects", () => {
  for (const effect of Object.values(HOUSE_EFFECTS)) {
    test(`${effect.id}: draws something, stays inside its canvas, bakes the same twice`, () => {
      const { w, h, frames } = bakeEffect(effect, 7);
      expect(frames.length).toBeGreaterThan(4);
      expect(frames.some((f) => alphaSum(f) > 0)).toBe(true);
      // Nothing solid on the outermost ring of pixels: a clipped effect would.
      for (const f of frames)
        for (let x = 0; x < w; x++)
          for (const y of [0, h - 1]) expect(f[(y * w + x) * 4 + 3]).toBeLessThan(200);
      expect(bakeEffect(effect, 7).frames.map(alphaSum)).toEqual(frames.map(alphaSum));
    });

    if (effect.loop) {
      test(`${effect.id}: loops without a seam`, () => {
        const f = new PixelFrame(effect.size[0], effect.size[1], effect.origin[0], effect.origin[1]);
        const draw = effect.make(1);
        draw(f, 0);
        const start = Array.from(f.toRgba());
        f.clear();
        draw(f, effect.duration);
        expect(Array.from(f.toRgba())).toEqual(start);
      });
    } else {
      test(`${effect.id}: a one-shot ends empty`, () => {
        const f = new PixelFrame(effect.size[0], effect.size[1], effect.origin[0], effect.origin[1]);
        effect.make(7)(f, effect.duration);
        expect(alphaSum(f.toRgba())).toBe(0);
      });
    }
  }

  test("painter: dithered alpha follows the Bayer matrix, light reads as glow on empty pixels", () => {
    const f = new PixelFrame(8, 8, 0, 0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) f.dot(x, y, 0xffffff, 0.5);
    let on = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) on += f.get(x, y) > 0 ? 1 : 0;
    expect(on).toBe(8);
    expect(bayer(0, 0)).toBeLessThan(bayer(1, 0));
    const g = new PixelFrame(8, 8, 4, 4);
    g.glow(0, 0, 4, 0xff0000, 1);
    const rgba = g.toRgba();
    const centre = (4 * 8 + 4) * 4;
    expect(rgba[centre]).toBe(255);
    expect(rgba[centre + 3]).toBeGreaterThan(0);
  });
});
