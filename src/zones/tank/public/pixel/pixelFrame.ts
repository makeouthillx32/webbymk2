// A tiny pixel-art painter for the house's effects. Each effect draws one
// frame into two buffers, the way hand-made pixel VFX are built:
//   color: real pixels (opaque, dithered, or truly translucent for smoke),
//   light: additive glow that reads as light over the dark house.
// Coordinates are local: (0, 0) is the effect's anchor (usually the feet),
// x right, y down, 1 unit = 1 pixel. Nothing here is random: effects take a
// seeded Rng, so a baked effect is the same on every screen.

export type Rgb = number; // 0xRRGGBB

/** 4x4 ordered (Bayer) thresholds, 0..1. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];

export const hex = (s: string): Rgb => {
  const h = s.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return parseInt(full.slice(0, 6), 16);
};
export const ramp = (list: string[]): Rgb[] => list.map(hex);
export const WHITE: Rgb = 0xffffff;

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0 before a, 1 after b, smooth in between. */
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const TAU = Math.PI * 2;
export const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number, s = 1.7) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
};

/** Seeded random numbers (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }
}

const r8 = (c: Rgb) => ((c >> 16) & 255) / 255;
const g8 = (c: Rgb) => ((c >> 8) & 255) / 255;
const b8 = (c: Rgb) => (c & 255) / 255;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => {
  const k = clamp(t);
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, k)) << s;
  return ch(16) | ch(8) | ch(0);
};

export class PixelFrame {
  readonly color: Float32Array; // straight RGBA, 0..1
  readonly light: Float32Array; // additive RGB
  /** Where local (0, 0) sits in the frame. */
  constructor(
    readonly w: number,
    readonly h: number,
    readonly ox: number,
    readonly oy: number,
  ) {
    this.color = new Float32Array(w * h * 4);
    this.light = new Float32Array(w * h * 3);
  }

  clear() {
    this.color.fill(0);
    this.light.fill(0);
  }

  /** Alpha-over one pixel (truly translucent below 1). */
  blend(x: number, y: number, c: Rgb, a = 1) {
    if (a <= 0) return;
    const px = Math.floor(x + this.ox);
    const py = Math.floor(y + this.oy);
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = (py * this.w + px) * 4;
    const k = clamp(a);
    const da = this.color[i + 3];
    const oa = k + da * (1 - k);
    if (oa <= 0) return;
    this.color[i] = (r8(c) * k + this.color[i] * da * (1 - k)) / oa;
    this.color[i + 1] = (g8(c) * k + this.color[i + 1] * da * (1 - k)) / oa;
    this.color[i + 2] = (b8(c) * k + this.color[i + 2] * da * (1 - k)) / oa;
    this.color[i + 3] = oa;
  }

  px(x: number, y: number, c: Rgb) {
    this.blend(x, y, c, 1);
  }

  /** A solid pixel where the 4x4 Bayer threshold lets `a` through. */
  dot(x: number, y: number, c: Rgb, a = 1) {
    if (a <= 0) return;
    const px = Math.floor(x + this.ox);
    const py = Math.floor(y + this.oy);
    if (a >= 1 || a > bayer(px, py)) this.blend(x, y, c, 1);
  }

  get(x: number, y: number): number {
    const px = Math.floor(x + this.ox);
    const py = Math.floor(y + this.oy);
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return 0;
    return this.color[(py * this.w + px) * 4 + 3];
  }

  /** Visit every pixel centre inside a box (local coordinates). */
  private each(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) {
    const ax = Math.max(Math.floor(x0 + this.ox), 0);
    const ay = Math.max(Math.floor(y0 + this.oy), 0);
    const bx = Math.min(Math.ceil(x1 + this.ox), this.w - 1);
    const by = Math.min(Math.ceil(y1 + this.oy), this.h - 1);
    for (let py = ay; py <= by; py++) for (let px = ax; px <= bx; px++) fn(px - this.ox + 0.5, py - this.oy + 0.5);
  }

  /** Filled circle, solid. */
  circle(x: number, y: number, r: number, c: Rgb) {
    this.each(x - r, y - r, x + r, y + r, (px, py) => {
      if ((px - x) ** 2 + (py - y) ** 2 <= r * r) this.px(px, py, c);
    });
  }

  /** Translucent disc (smoke, mist, dust). */
  disc(x: number, y: number, r: number, c: Rgb, a: number) {
    this.each(x - r, y - r, x + r, y + r, (px, py) => {
      if ((px - x) ** 2 + (py - y) ** 2 <= r * r) this.blend(px, py, c, a);
    });
  }

  /** Ellipse outline `w` px thick (a ring on the floor is ry ≈ rx * 0.3). `keep` picks part of it by angle. */
  oval(x: number, y: number, rx: number, ry: number, w: number, c: Rgb, a = 1, keep?: (angle: number) => boolean) {
    if (rx <= 0 || ry <= 0) return;
    const ox = rx + w;
    const oy = ry + w;
    this.each(x - ox, y - oy, x + ox, y + oy, (px, py) => {
      const dx = px - x;
      const dy = py - y;
      const outer = (dx / (rx + w / 2)) ** 2 + (dy / (ry + w / 2)) ** 2;
      const inner = rx > w / 2 && ry > w / 2 ? (dx / (rx - w / 2)) ** 2 + (dy / (ry - w / 2)) ** 2 : 2;
      if (outer <= 1 && inner >= 1 && (!keep || keep(Math.atan2(dy, dx)))) this.dot(px, py, c, a);
    });
  }

  line(x0: number, y0: number, x1: number, y1: number, c: Rgb | ((u: number) => Rgb), a = 1) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.dot(lerp(x0, x1, u), lerp(y0, y1, u), typeof c === "function" ? c(u) : c, a);
    }
  }

  /** Additive light with a soft falloff. */
  glow(x: number, y: number, r: number, c: Rgb, k: number) {
    if (k <= 0 || r <= 0) return;
    const cr = r8(c);
    const cg = g8(c);
    const cb = b8(c);
    this.each(x - r, y - r, x + r, y + r, (px, py) => {
      const d = Math.hypot(px - x, py - y) / r;
      if (d >= 1) return;
      const f = (1 - d) * (1 - d) * k;
      const i = (Math.floor(py + this.oy) * this.w + Math.floor(px + this.ox)) * 3;
      this.light[i] += cr * f;
      this.light[i + 1] += cg * f;
      this.light[i + 2] += cb * f;
    });
  }

  /** A twinkle: a plus with a bright centre; `arm` 0 is a single pixel. */
  star(x: number, y: number, arm: number, c: Rgb, tip: Rgb, k = 0.5) {
    const a = Math.round(arm);
    this.px(x, y, WHITE);
    for (let i = 1; i <= a; i++) {
      const col = i === a ? tip : c;
      this.px(x + i, y, col);
      this.px(x - i, y, col);
      this.px(x, y + i, col);
      this.px(x, y - i, col);
    }
    this.glow(x, y, 3 + a * 2, c, k);
  }

  /** Pixel sprite from rows of characters, each mapped through `pal` ("." or space = empty). */
  sprite(rows: readonly string[], pal: Record<string, Rgb>, x: number, y: number, a = 1) {
    for (let j = 0; j < rows.length; j++)
      for (let i = 0; i < rows[j].length; i++) {
        const c = pal[rows[j][i]];
        if (c !== undefined) this.dot(x + i, y + j, c, a);
      }
  }

  /**
   * Color over transparent plus light, as straight-alpha RGBA bytes. Light
   * on an empty pixel becomes a pixel of that light whose alpha is its
   * brightness, so a glow still reads as additive over a dark scene.
   */
  toRgba(out = new Uint8ClampedArray(this.w * this.h * 4)): Uint8ClampedArray {
    for (let p = 0, n = this.w * this.h; p < n; p++) {
      const ca = this.color[p * 4 + 3];
      let r = this.color[p * 4] * ca + this.light[p * 3];
      let g = this.color[p * 4 + 1] * ca + this.light[p * 3 + 1];
      let b = this.color[p * 4 + 2] * ca + this.light[p * 3 + 2];
      const a = clamp(Math.max(ca, r, g, b));
      if (a > 0) {
        r = clamp(r / a);
        g = clamp(g / a);
        b = clamp(b / a);
      }
      out[p * 4] = r * 255;
      out[p * 4 + 1] = g * 255;
      out[p * 4 + 2] = b * 255;
      out[p * 4 + 3] = a * 255;
    }
    return out;
  }
}
