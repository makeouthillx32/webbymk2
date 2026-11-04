import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import type { ShownMember } from "../altDirector/castMirror";
import { artSize } from "./pixelPass";

// HouseFx bakes atlases on a 2D canvas; give it a stand-in document.
const realDocument = (globalThis as { document?: unknown }).document;
const realImageData = (globalThis as { ImageData?: unknown }).ImageData;
beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }),
  };
  (globalThis as { ImageData?: unknown }).ImageData = class {
    constructor(
      public data: Uint8ClampedArray,
      public width: number,
      public height: number,
    ) {}
  };
});
afterAll(() => {
  (globalThis as { document?: unknown }).document = realDocument;
  (globalThis as { ImageData?: unknown }).ImageData = realImageData;
});

const { HouseFx, SLEEP_AFTER_SECONDS } = await import("./houseFx");
const eye = new THREE.Vector3(0, 2, 6);
const joe = (x: number, walking = false): ShownMember => ({ id: "joe", kind: "human", x, z: 0, walking });
const dog = (x: number, walking = false): ShownMember => ({ id: "golden-dog", kind: "dog", x, z: 0, walking });

describe("house fx", () => {
  test("spotted when someone appears, step dust while they walk, a poof when they go", () => {
    const fx = new HouseFx();
    fx.update(0.05, [joe(0)], eye);
    expect(fx.counts()).toEqual({ spotted: 1 });
    fx.update(0.05, [joe(0.1, true)], eye);
    expect(fx.counts().step).toBe(1);
    for (let i = 0; i < 10; i++) fx.update(0.05, [joe(0.2, true)], eye);
    expect(fx.counts().step).toBeGreaterThan(1);
    fx.update(0.05, [], eye);
    expect(fx.counts().vanish).toBe(1);
    // One-shots clear themselves.
    for (let i = 0; i < 40; i++) fx.update(0.05, [], eye);
    expect(fx.counts()).toEqual({});
    expect(fx.group.children).toHaveLength(0);
  });

  test("a still pet falls asleep; settling next to a person turns the Zs into hearts", () => {
    const fx = new HouseFx();
    fx.update(0.05, [dog(4)], eye);
    fx.update(SLEEP_AFTER_SECONDS + 1, [dog(4)], eye);
    expect(fx.counts().sleep).toBe(1);
    fx.update(0.05, [dog(4), joe(4.6)], eye);
    expect(fx.counts().sleep).toBeUndefined();
    expect(fx.counts().hearts).toBe(1);
    // Walking off ends the hearts.
    fx.update(0.05, [dog(6, true), joe(4.6)], eye);
    expect(fx.counts().hearts).toBeUndefined();
    fx.dispose();
    expect(fx.group.children).toHaveLength(0);
  });

  test("reduced motion: no effects at all", () => {
    const fx = new HouseFx();
    fx.update(0.05, [joe(0)], eye, false);
    fx.update(0.05, [], eye, false);
    expect(fx.counts()).toEqual({});
    expect(fx.group.visible).toBe(false);
  });
});

describe("pixel pass sizing", () => {
  test("art resolution is the view over the pixel size, clamped, aspect kept", () => {
    expect(artSize(900, 480, 3)).toEqual({ width: 300, height: 160 });
    expect(artSize(384, 216, 2)).toEqual({ width: 192, height: 108 });
    expect(artSize(200, 100, 3).height).toBe(96);
    expect(artSize(4000, 2000, 3).height).toBe(400);
  });
});
