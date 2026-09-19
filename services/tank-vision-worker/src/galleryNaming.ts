import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Naming people from the operator's graded gallery -- on the fast path.
 *
 * The worker's own appearance signature is a colour histogram, and the identity
 * bake-off showed it cannot recognise anyone across rooms. The graded gallery
 * (services/tank-vision-gpu/out/gallery, exported by export_worker_gallery.py)
 * is OSNet-AIN embeddings of ~11k crops the operator confirmed, plus a trained
 * classifier and the "not a person" examples (the rack, the jacket).
 *
 * The same OSNet-AIN runs here as ONNX (models/osnet_ain_x1_0.onnx, cosine
 * 1.00000 against PyTorch on real crops), but it costs ~140-280 ms per person on
 * this CPU. So it never sits in the detection loop: embeddings run on their own
 * thread (osnetThread.ts), each person is re-checked every few seconds, and in
 * between a box inherits the name of the body standing where it is.
 *
 * Scoring mirrors the learner (live_learner.py Gallery.scores): mean of each
 * name's 5 closest crops, plus 0.1 x the classifier's probability. A body earns
 * a name by one clear look (CONFIDENT_MARGIN) or by winning VOTE_WINS checks in a
 * row (applyLook), and keeps it until another name earns it. A body that matches
 * the rack clearly better than any person is hidden, not named. End-to-end on
 * live frames against the Python path: 7/8 same best name (the 8th a coin flip
 * neither path named).
 */

export const TOPK = 5;
export const CLASSIFIER_WEIGHT = 0.1;
export const CONFIDENT_MARGIN = 0.06;
export const NEGATIVE_MARGIN = 0.03;

export type GalleryPack = {
  dims: number;
  names: string[];
  mat: Float32Array;
  negatives: Float32Array;
  negativeRows: number;
  classifier: { classes: string[]; coef: number[][]; intercept: number[] } | null;
  loadedFrom: number;
};

function readF32(path: string): Float32Array {
  const buf = readFileSync(path);
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

/** Load the exported pack, or null when it is absent (the worker then keeps its old method). */
export function loadPack(dir: string): GalleryPack | null {
  const metaPath = join(dir, "worker-person.json");
  if (!existsSync(metaPath)) return null;
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const mat = readF32(join(dir, "worker-person.f32"));
  if (mat.length !== meta.rows * meta.dims) {
    throw new Error(`worker-person.f32 has ${mat.length} floats, expected ${meta.rows} x ${meta.dims}`);
  }
  const negPath = join(dir, "worker-person-negative.f32");
  const negatives = existsSync(negPath) ? readF32(negPath) : new Float32Array(0);
  return {
    dims: meta.dims,
    names: meta.names,
    mat,
    negatives,
    negativeRows: Math.floor(negatives.length / meta.dims),
    classifier: meta.classifier ?? null,
    loadedFrom: statSync(metaPath).mtimeMs,
  };
}

export function packChangedOnDisk(dir: string, pack: GalleryPack | null): boolean {
  const metaPath = join(dir, "worker-person.json");
  if (!existsSync(metaPath)) return false;
  return !pack || statSync(metaPath).mtimeMs > pack.loadedFrom;
}

function dotRow(mat: Float32Array, row: number, dims: number, v: Float32Array): number {
  let s = 0;
  const base = row * dims;
  for (let k = 0; k < dims; k++) s += mat[base + k] * v[k];
  return s;
}

export type GalleryVerdict = {
  /** Best name, or null when it does not clearly lead the next (or when hidden). */
  name: string | null;
  best: string | null;
  margin: number;
  /** Clearly more rack/jacket than person: hide this box from the director. */
  notAPerson: boolean;
};

/** Score one L2-normalised embedding against the gallery. */
export function scoreEmbedding(pack: GalleryPack, v: Float32Array): GalleryVerdict {
  const byName = new Map<string, number[]>();
  for (let row = 0; row < pack.names.length; row++) {
    const sims = byName.get(pack.names[row]) ?? [];
    sims.push(dotRow(pack.mat, row, pack.dims, v));
    byName.set(pack.names[row], sims);
  }
  const raw = new Map<string, number>();
  for (const [name, sims] of byName) {
    sims.sort((a, b) => b - a);
    const top = sims.slice(0, TOPK);
    raw.set(name, top.reduce((a, b) => a + b, 0) / top.length);
  }

  const learned = new Map<string, number>();
  if (pack.classifier) {
    const { classes, coef, intercept } = pack.classifier;
    const logits = classes.map((_, c) => {
      let s = intercept[c];
      for (let k = 0; k < pack.dims; k++) s += coef[c][k] * v[k];
      return s;
    });
    if (classes.length === 2 && coef.length === 1) {
      const p = 1 / (1 + Math.exp(-logits[0]));
      learned.set(classes[0], 1 - p);
      learned.set(classes[1], p);
    } else {
      const max = Math.max(...logits);
      const exps = logits.map((l) => Math.exp(l - max));
      const sum = exps.reduce((a, b) => a + b, 0);
      classes.forEach((c, i) => learned.set(c, exps[i] / sum));
    }
  }

  const ranked = [...raw.entries()]
    .map(([name, score]) => [name, score + CLASSIFIER_WEIGHT * (learned.get(name) ?? 0)] as const)
    .sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return { name: null, best: null, margin: 0, notAPerson: false };
  const [best, bestScore] = ranked[0];
  const margin = ranked.length > 1 ? bestScore - ranked[1][1] : bestScore;

  let bestNegative = -1;
  for (let row = 0; row < pack.negativeRows; row++) {
    bestNegative = Math.max(bestNegative, dotRow(pack.negatives, row, pack.dims, v));
  }
  const bestRawPerson = Math.max(...raw.values());
  const notAPerson = pack.negativeRows > 0 && bestNegative > bestRawPerson + NEGATIVE_MARGIN;

  return {
    name: !notAPerson && margin >= CONFIDENT_MARGIN ? best : null,
    best,
    margin,
    notAPerson,
  };
}

// ── crops ────────────────────────────────────────────────────────────────────

export const CROP_W = 128;
export const CROP_H = 256;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Cut a person out of the worker's RGBA frame and shape it the way OSNet was
 * trained: 256x128 (tall), bilinear, ImageNet mean/std, planar CHW.
 * Returns null for a crop too small to say anything (it would match everybody).
 */
export function cropToTensor(
  rgba: Uint8Array | Uint8ClampedArray,
  frameW: number,
  frameH: number,
  rect: { x: number; y: number; w: number; h: number },
  minHeight = 40,
): Float32Array | null {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(frameW, rect.x + rect.w);
  const y1 = Math.min(frameH, rect.y + rect.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < minHeight) return null;
  const plane = CROP_W * CROP_H;
  const out = new Float32Array(3 * plane);
  for (let oy = 0; oy < CROP_H; oy++) {
    const sy = y0 + ((oy + 0.5) * h) / CROP_H - 0.5;
    const iy = Math.max(0, Math.min(frameH - 1, Math.floor(sy)));
    const iy1 = Math.min(frameH - 1, iy + 1);
    const fy = Math.max(0, Math.min(1, sy - iy));
    for (let ox = 0; ox < CROP_W; ox++) {
      const sx = x0 + ((ox + 0.5) * w) / CROP_W - 0.5;
      const ix = Math.max(0, Math.min(frameW - 1, Math.floor(sx)));
      const ix1 = Math.min(frameW - 1, ix + 1);
      const fx = Math.max(0, Math.min(1, sx - ix));
      for (let c = 0; c < 3; c++) {
        const p00 = rgba[(iy * frameW + ix) * 4 + c];
        const p01 = rgba[(iy * frameW + ix1) * 4 + c];
        const p10 = rgba[(iy1 * frameW + ix) * 4 + c];
        const p11 = rgba[(iy1 * frameW + ix1) * 4 + c];
        const value = (p00 * (1 - fx) + p01 * fx) * (1 - fy) + (p10 * (1 - fx) + p11 * fx) * fy;
        out[c * plane + oy * CROP_W + ox] = (value / 255 - MEAN[c]) / STD[c];
      }
    }
  }
  return out;
}

// ── per-camera memory ────────────────────────────────────────────────────────

type Box = { nx: number; ny: number; nw: number; nh: number };

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.nx + a.nw, b.nx + b.nw) - Math.max(a.nx, b.nx));
  const iy = Math.max(0, Math.min(a.ny + a.nh, b.ny + b.nh) - Math.max(a.ny, b.ny));
  const inter = ix * iy;
  const union = a.nw * a.nh + b.nw * b.nh - inter;
  return union > 0 ? inter / union : 0;
}

export type Remembered = {
  box: Box;
  verdict: GalleryVerdict | null;
  checkedAt: number;
  pending: boolean;
  /** The last few looks at this body: who won, by how much. */
  history?: Array<{ best: string | null; margin: number }>;
  /** The name this body has earned and keeps until another name earns it. */
  held?: string | null;
};

/** Winning this many checks in a row, each by VOTE_MIN_MARGIN, earns a name too. */
export const VOTE_WINS = 3;
export const VOTE_MIN_MARGIN = 0.012;

/**
 * Fold a fresh look into a body's memory and decide the name it carries.
 *
 * Same rule the learner proved on the graded data: a name is earned by one
 * clear look (margin >= CONFIDENT_MARGIN) or by winning VOTE_WINS checks in a
 * row, and then sticks until another name wins that many in a row. One bad
 * angle must not un-name someone; Malia at her desk leads by ~0.03-0.05, below a
 * single-look win, and was never named without this.
 */
export function applyLook(entry: Remembered, look: GalleryVerdict): GalleryVerdict {
  const history = [...(entry.history ?? []), { best: look.best, margin: look.margin }].slice(-VOTE_WINS);
  entry.history = history;
  let held = entry.held ?? null;
  const streak =
    history.length >= VOTE_WINS && history.every((h) => h.best === look.best && h.margin >= VOTE_MIN_MARGIN);
  if (look.notAPerson) held = null;
  else if (look.margin >= CONFIDENT_MARGIN || streak) held = look.best;
  else if (held && held !== look.best && history.length >= VOTE_WINS && history.every((h) => h.best === look.best)) held = null;
  entry.held = held;
  return { ...look, name: look.notAPerson ? null : held };
}

export const MEMORY = {
  /** A body is re-checked this often. */
  recheckMs: 3_000,
  /**
   * A name is kept this long without a fresh look (the box must still be there).
   * Longer than one full round-robin: the observer revisits each camera only
   * every ~6 passes (~12 s with six cameras), and an 8 s memory forgot every
   * name before the camera came round again (2026-09-19).
   */
  forgetMs: 30_000,
  /** How much a box must overlap the remembered one to be the same body. */
  sameBodyIou: 0.3,
};

/** The remembered body a box belongs to, if any (most overlap wins). */
export function recall(memory: Remembered[], box: Box, now: number): Remembered | null {
  let best: Remembered | null = null;
  let bestIou = MEMORY.sameBodyIou;
  for (const entry of memory) {
    if (now - entry.checkedAt > MEMORY.forgetMs && !entry.pending) continue;
    const overlap = iou(entry.box, box);
    if (overlap >= bestIou) {
      best = entry;
      bestIou = overlap;
    }
  }
  return best;
}

/**
 * One name per camera: if two bodies claim a name, the clearer claim keeps it.
 * Returns index -> verdict for the boxes that may carry their name.
 */
export function exclusiveNames(claims: Array<{ index: number; verdict: GalleryVerdict | null }>): Map<number, GalleryVerdict> {
  const out = new Map<number, GalleryVerdict>();
  const taken = new Set<string>();
  const ordered = claims
    .filter((c): c is { index: number; verdict: GalleryVerdict } => Boolean(c.verdict))
    .sort((a, b) => b.verdict.margin - a.verdict.margin);
  for (const claim of ordered) {
    const { name } = claim.verdict;
    if (name && taken.has(name)) {
      out.set(claim.index, { ...claim.verdict, name: null });
      continue;
    }
    if (name) taken.add(name);
    out.set(claim.index, claim.verdict);
  }
  return out;
}
