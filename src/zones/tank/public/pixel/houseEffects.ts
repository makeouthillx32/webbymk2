// The house's pixel effects: little moments that make the mirrored cast feel
// like a game rather than markers on a map. Each is drawn per frame from `t`
// alone (and a seed), so it bakes into a flipbook once and plays anywhere.
//
//   spotted   a camera finds someone: a scan beam drops on them, a ring
//             snaps out on the floor, twinkles fly off and hang.
//   vanish    they leave every camera: a cartoon poof that lifts away.
//   step      a puff of dust at the feet while walking.
//   sleep     Zs drift up off a pet that hasn't moved in a while.
//   hearts    hearts rise off a pet curled up next to one of its people.
//
// Scale: a person is about 64 px tall (1 px ≈ 2.7 cm in the house), anchor
// (0, 0) is the feet, or the top of the head for sleep and hearts.

import { PixelFrame, Rng, TAU, WHITE, clamp, ease, mix, ramp, smooth, type Rgb } from "./pixelFrame";

export type HouseEffectId = "spotted" | "vanish" | "step" | "sleep" | "hearts";

export type HouseEffect = {
  id: HouseEffectId;
  size: [number, number];
  origin: [number, number];
  duration: number;
  loop: boolean;
  fps: number;
  /** Build one instance (seeded); returns the frame painter for time t. */
  make: (seed: number) => (f: PixelFrame, t: number) => void;
};

// ---------------------------------------------------------------- palettes
const SCAN = ramp(["#08202c", "#0f4a5c", "#1a8aa0", "#4fd6e0", "#bdf8ff"]);
const SMOKE = ramp(["#2b2742", "#55506e", "#8d88a8", "#c4bfd8", "#efedf8"]);
const STARS = ramp(["#f5b83a", "#ffe27a", "#fff6c8"]);
const DUST = ramp(["#3f362e", "#7c6c5a", "#b9a88a", "#e9dcc0"]);
const NIGHT = ramp(["#121a3a", "#3550a0", "#8fb4ff", "#e4eeff"]);
const LOVE = ramp(["#3a0f24", "#a3244e", "#ff5a86", "#ffb3c8"]);

/** Exponential drag: distance covered after `a` seconds at start speed v. */
const drift = (v: number, a: number, k: number) => (v * (1 - Math.exp(-k * a))) / k;

// --------------------------------------------------------------- spotted
const spotted: HouseEffect = {
  id: "spotted",
  size: [104, 124],
  origin: [52, 112],
  duration: 1,
  loop: false,
  fps: 20,
  make(seed) {
    const R = new Rng(seed);
    const TOP = -98;
    const sparks = Array.from({ length: 16 }, () => ({
      born: R.range(0.03, 0.2),
      y: R.range(-78, -8),
      vx: R.sign() * R.range(50, 130),
      vy: R.range(-70, 10),
      life: R.range(0.4, 0.72),
      big: R.next() < 0.35,
      c: R.pick([SCAN[3], SCAN[4], STARS[1]]),
    }));
    const motes = Array.from({ length: 9 }, () => ({
      born: R.range(0.08, 0.3),
      x: R.range(-26, 26),
      vy: -R.range(20, 40),
      life: R.range(0.35, 0.6),
    }));
    return (f, t) => {
      // the hero frame: a fat white column and a flash on the floor
      if (t < 0.07) {
        for (let y = TOP + 18; y < 0; y++) {
          const w = 7 + (y / TOP) * -2;
          for (let x = -w; x <= w; x++) f.px(x, y, Math.abs(x) < w - 2 ? WHITE : SCAN[4]);
        }
        f.oval(0, -1, 14, 4, 3, WHITE);
        f.glow(0, -40, 60, SCAN[3], 0.9);
      }
      // the beam narrows to a thread and thins away
      const bu = (t - 0.07) / 0.28;
      if (bu >= 0 && bu < 1) {
        const w = 6 * (1 - ease.outCubic(bu)) + 0.6;
        for (let y = TOP; y < 0; y++) {
          const top = smooth(TOP, TOP + 34, y);
          const a = (1 - bu) * top;
          for (let x = -Math.ceil(w); x <= Math.ceil(w); x++) {
            const edge = Math.abs(x) / Math.max(w, 0.5);
            const c = edge < 0.34 ? WHITE : edge < 0.7 ? SCAN[4] : SCAN[3];
            if (edge <= 1) f.dot(x, y, c, a);
          }
        }
        f.glow(0, -44, 40, SCAN[3], 0.45 * (1 - bu));
      }
      // a scan line climbs from the feet to the head
      const su = (t - 0.1) / 0.4;
      if (su >= 0 && su < 1) {
        const y = -2 - 70 * ease.outCubic(su);
        const half = 13 - 5 * su;
        f.oval(0, y, half, 3, 1, su < 0.3 ? WHITE : SCAN[4], 1 - su * 0.5, (g) => Math.sin(g) > 0);
        f.oval(0, y, half, 3, 1, SCAN[2], 0.55 * (1 - su), (g) => Math.sin(g) <= 0);
        f.glow(0, y, 18, SCAN[3], 0.45 * (1 - su));
      }
      // two rings snap out over the floor
      for (const [delay, k] of [
        [0.02, 1],
        [0.14, 0.7],
      ] as const) {
        const u = (t - delay) / 0.5;
        if (u <= 0 || u >= 1) continue;
        const r = 5 + 34 * ease.outQuart(u);
        f.oval(0, -1, r, r * 0.3, u < 0.25 ? 2 : 1, u < 0.2 ? WHITE : SCAN[3], u < 0.45 ? k : k * (1 - (u - 0.45) / 0.55) * 1.4);
      }
      const pool = 1 - smooth(0, 0.7, t);
      if (pool > 0) f.glow(0, -2, 34, SCAN[3], 0.35 * pool);
      // twinkles flung off the beam: fast out, brake, hang, wink out
      for (const s of sparks) {
        const a = t - s.born;
        if (a < 0 || a > s.life) continue;
        const x = drift(s.vx, a, 6);
        const y = s.y + drift(s.vy, a, 6) + 14 * a * a;
        const u = a / s.life;
        const twinkle = Math.sin((a + s.born) * 40) > -0.3;
        if (u < 0.2 && s.big) f.star(x, y, 2, s.c, SCAN[2], 0.5);
        else if (u < 0.75 || twinkle) f.star(x, y, s.big && u < 0.6 ? 1 : 0, s.c, SCAN[2], 0.3 * (1 - u));
      }
      // motes rise off the ring
      for (const m of motes) {
        const a = t - m.born;
        if (a < 0 || a > m.life) continue;
        const u = a / m.life;
        f.dot(m.x, -1 + m.vy * a, u < 0.5 ? SCAN[4] : SCAN[3], 1 - u);
      }
    };
  },
};

// ---------------------------------------------------------------- vanish
const vanish: HouseEffect = {
  id: "vanish",
  size: [112, 100],
  origin: [56, 92],
  duration: 1.15,
  loop: false,
  fps: 20,
  make(seed) {
    const R = new Rng(seed);
    const CY = -30;
    const balls = [
      ...Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * TAU + R.range(-0.25, 0.25);
        const sp = R.range(120, 165);
        return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, r0: 3, r1: R.range(5.5, 7.5), life: R.range(0.7, 0.9), delay: R.range(0, 0.04) };
      }),
      ...Array.from({ length: 5 }, () => {
        const a = R.range(0, TAU);
        const sp = R.range(15, 45);
        return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r0: 4, r1: R.range(7, 8.5), life: R.range(0.8, 1), delay: R.range(0.02, 0.06) };
      }),
      ...Array.from({ length: 6 }, () => {
        const a = R.range(0, TAU);
        const sp = R.range(190, 240);
        return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, r0: 2, r1: R.range(2.8, 3.6), life: R.range(0.25, 0.38), delay: R.range(0.01, 0.04) };
      }),
    ];
    const stars = Array.from({ length: 7 }, () => {
      const a = R.range(-Math.PI * 0.95, -Math.PI * 0.05);
      const sp = R.range(70, 125);
      return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: R.range(0.5, 0.85), delay: R.range(0.03, 0.1), c: R.pick(STARS) };
    });
    const skid = Array.from({ length: 6 }, () => {
      const s = R.sign();
      return { x: s * R.range(1, 6), vx: s * R.range(30, 70), r: R.range(1.8, 3), life: R.range(0.4, 0.65) };
    });

    const place = (b: (typeof balls)[number], a: number) => {
      const x = drift(b.vx, a, 6.5);
      const y = CY + drift(b.vy, a, 6.5) - 20 * a; // the cloud lifts as it slows
      const u = a / b.life;
      const grow = b.r0 + (b.r1 - b.r0) * ease.outBack(clamp(a / 0.22), 2);
      const r = grow * (u < 0.55 ? 1 : 1 - ease.inCubic(clamp((u - 0.55) / 0.45)) * 0.9 - 0.1 * clamp((u - 0.55) / 0.45));
      return { x, y: Math.min(y, -r * 0.7), r };
    };

    return (f, t) => {
      // a soft pool of the pop's light where they stood
      const pool = 1 - smooth(0.05, 0.8, t);
      if (pool > 0) f.glow(0, -2, 30, SMOKE[4], 0.25 * pool);
      // dust skids along the floor from the feet
      for (const d of skid) {
        const a = t - 0.02;
        if (a < 0 || a > d.life) continue;
        const u = a / d.life;
        f.disc(d.x + drift(d.vx, a, 6), -1.5 - 6 * a, d.r * (1 + u * 0.5), u < 0.4 ? SMOKE[3] : SMOKE[2], 0.75 * (1 - u));
      }
      // the cloud: shade, body, lit cap; neighbouring balls merge into one lump
      const live = balls
        .map((b) => ({ b, a: t - b.delay }))
        .filter(({ b, a }) => a >= 0 && a < b.life)
        .map(({ b, a }) => ({ ...place(b, a), a }));
      for (const s of live) if (s.r >= 0.8) f.disc(s.x + s.r * 0.18, s.y + s.r * 0.22, s.r, s.a < 0.1 ? SMOKE[3] : SMOKE[1], 0.85);
      for (const s of live) if (s.r >= 0.8) f.disc(s.x - s.r * 0.05, s.y - s.r * 0.08, s.r * 0.84, s.a < 0.1 ? SMOKE[4] : SMOKE[2], 0.9);
      for (const s of live) {
        if (s.r < 1.6 || s.y > CY + 10) continue;
        f.disc(s.x - s.r * 0.3, s.y - s.r * 0.36, s.r * 0.42, s.a < 0.18 ? WHITE : SMOKE[3], 0.85);
      }
      // the pop: a white ball and a ring for a couple of frames
      if (t < 0.07) {
        f.circle(0, CY, 10, SMOKE[4]);
        f.circle(0, CY, 7.5, WHITE);
        f.glow(0, CY, 40, SMOKE[4], 0.8);
      }
      const ru = (t - 0.03) / 0.22;
      if (ru > 0 && ru < 1) f.oval(0, CY, 9 + 22 * ease.outCubic(ru), 9 + 20 * ease.outCubic(ru), Math.max(1, 2.4 * (1 - ru)), ru < 0.3 ? WHITE : SMOKE[3], 1.1 - ru);
      // little stars spun off the pop
      for (const s of stars) {
        const a = t - s.delay;
        if (a < 0 || a > s.life) continue;
        const u = a / s.life;
        const x = drift(s.vx, a, 4);
        const y = CY + drift(s.vy, a, 4) + 60 * a * a;
        if (u < 0.7 || Math.sin(a * 45) > 0) f.star(x, y, u < 0.3 ? 2 : u < 0.6 ? 1 : 0, s.c, STARS[0], 0.3);
      }
    };
  },
};

// ------------------------------------------------------------------ step
const step: HouseEffect = {
  id: "step",
  size: [40, 20],
  origin: [20, 16],
  duration: 0.55,
  loop: false,
  fps: 20,
  make(seed) {
    const R = new Rng(seed);
    const puffs = Array.from({ length: 4 }, (_, i) => {
      const s = i % 2 ? 1 : -1;
      return { x: s * R.range(0.5, 3), vx: s * R.range(14, 34), vy: -R.range(4, 12), r: R.range(1.4, 2.5), life: R.range(0.32, 0.5), delay: R.range(0, 0.06) };
    });
    return (f, t) => {
      for (const p of puffs) {
        const a = t - p.delay;
        if (a < 0 || a > p.life) continue;
        const u = a / p.life;
        const x = p.x + drift(p.vx, a, 8);
        const y = -1.2 + drift(p.vy, a, 5);
        const r = p.r * (0.7 + 0.6 * ease.outCubic(u)) * (u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1);
        if (r < 0.6) continue;
        f.disc(x + 0.3, y + 0.4, r, DUST[1], 0.55 * (1 - u * 0.5));
        f.disc(x - 0.2, y - 0.3, r * 0.8, DUST[2], 0.7 * (1 - u * 0.6));
        if (r > 1.4) f.disc(x - r * 0.3, y - r * 0.4, r * 0.38, DUST[3], 0.7 * (1 - u));
      }
    };
  },
};

// -------------------------------------------------------- glyph helpers
type Mask = readonly string[];
/** A mask with a 1 px outline, filled with `fill` and lit by `hi` on its top row. */
function glyph(f: PixelFrame, mask: Mask, x: number, y: number, fill: Rgb, outline: Rgb, a: number, hi?: Rgb) {
  const at = (i: number, j: number) => j >= 0 && j < mask.length && i >= 0 && i < mask[j].length && mask[j][i] === "#";
  const h = mask.length;
  const w = Math.max(...mask.map((r) => r.length));
  const x0 = Math.round(x - w / 2);
  const y0 = Math.round(y - h / 2);
  for (let j = -1; j <= h; j++)
    for (let i = -1; i <= w; i++) {
      if (at(i, j)) continue;
      if (at(i - 1, j) || at(i + 1, j) || at(i, j - 1) || at(i, j + 1)) f.dot(x0 + i, y0 + j, outline, a);
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!at(i, j)) continue;
      const top = !at(i, j - 1);
      f.dot(x0 + i, y0 + j, hi && top ? hi : fill, a);
    }
}

const Z_SMALL: Mask = ["###", ".#.", "###"];
const Z_MID: Mask = ["####", "..#.", ".#..", "####"];
const Z_BIG: Mask = ["#####", "...#.", "..#..", ".#...", "#####"];

const HEART_SMALL: Mask = [".#.#.", "#####", ".###.", "..#.."];
const HEART_BIG: Mask = [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."];

// ----------------------------------------------------------------- sleep
const sleep: HouseEffect = {
  id: "sleep",
  size: [48, 56],
  origin: [8, 52],
  duration: 3,
  loop: true,
  fps: 12,
  make() {
    return (f, t) => {
      const phase = t / 3;
      for (let i = 0; i < 3; i++) {
        const u = (phase + i / 3) % 1;
        const x = 3 + u * 16 + Math.sin(u * TAU * 1.25 + i * 2) * 3;
        const y = -3 - u * 42;
        // pixel things pop rather than fade: a speck, then growing Zs, then out
        if (u < 0.05) {
          f.px(x, y, NIGHT[3]);
          continue;
        }
        if (u > 0.94) continue;
        const mask = u < 0.28 ? Z_SMALL : u < 0.62 ? Z_MID : u < 0.88 ? Z_BIG : Z_MID;
        const fill = u > 0.75 ? NIGHT[2] : mix(NIGHT[2], NIGHT[3], 1 - u);
        glyph(f, mask, x, y, fill, NIGHT[0], 1, u > 0.75 ? NIGHT[3] : WHITE);
        f.glow(x, y, 9, NIGHT[2], u > 0.75 ? 0.12 : 0.22);
      }
      // a slow breathing glow over the sleeper
      f.glow(0, 0, 14, NIGHT[1], 0.18 + 0.08 * Math.sin(phase * TAU * 2));
    };
  },
};

// ---------------------------------------------------------------- hearts
const hearts: HouseEffect = {
  id: "hearts",
  size: [48, 56],
  origin: [24, 52],
  duration: 2.4,
  loop: true,
  fps: 12,
  make() {
    return (f, t) => {
      const phase = t / 2.4;
      for (let i = 0; i < 3; i++) {
        const u = (phase + i / 3) % 1;
        const side = i === 1 ? 1 : -1;
        const x = side * (3 + u * 7) + Math.sin(u * TAU + i * 2.1) * 3;
        const y = -4 - u * 38;
        const a = 1 - smooth(0.86, 1, u);
        if (u < 0.05) {
          f.px(x, y, LOVE[3]);
          continue;
        }
        // lub-dub: the heart swells for a beat as it rises
        const beat = Math.sin(u * TAU * 3) > 0.75;
        const big = u > 0.3 && (u < 0.82 || beat);
        if (u > 0.86) {
          f.star(x, y, u < 0.93 ? 1 : 0, LOVE[3], LOVE[2], 0.35 * a);
          continue;
        }
        glyph(f, big ? HEART_BIG : HEART_SMALL, x, y, beat ? LOVE[3] : LOVE[2], LOVE[0], 1, beat ? WHITE : LOVE[3]);
        f.glow(x, y, 10, LOVE[2], 0.25);
      }
    };
  },
};

export const HOUSE_EFFECTS: Record<HouseEffectId, HouseEffect> = { spotted, vanish, step, sleep, hearts };

/** Every frame of one instance, as straight-alpha RGBA bytes. */
export function bakeEffect(effect: HouseEffect, seed = 1): { w: number; h: number; frames: Uint8ClampedArray[] } {
  const [w, h] = effect.size;
  const f = new PixelFrame(w, h, effect.origin[0], effect.origin[1]);
  const draw = effect.make(seed);
  const count = effect.loop ? Math.round(effect.duration * effect.fps) : Math.ceil(effect.duration * effect.fps);
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < count; i++) {
    f.clear();
    draw(f, i / effect.fps);
    frames.push(f.toRgba());
  }
  return { w, h, frames };
}
