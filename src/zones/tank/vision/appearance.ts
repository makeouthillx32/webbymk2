// src/zones/tank/vision/appearance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Telling one person from another by how they look, not where they stand.
//
// Room priors are gone (see detectionCatalog) because they were never evidence:
// this is one house and its members move through all of it. What is left is the
// only thing that actually distinguishes Tyler from Malia from Joe in a frame —
// appearance.
//
// WHAT THIS IS, precisely: a banded colour signature of the person's crop. The
// box is split into horizontal bands and each band is reduced to a coarse
// hue/saturation/value histogram, so "pale top over dark legs" is a different
// vector from "dark top over pale legs". Cosine similarity then ranks a
// detection against enrolled references.
//
// WHAT THIS IS NOT, and must never be described as: face recognition. It never
// looks at a face. It is dominated by CLOTHING, which means it is accurate
// within a session and goes stale the moment someone changes outfit. That is a
// real limitation, not a rough edge — enrolment is expected to be re-done, and
// the operator must be able to see when a match has gone weak.
//
// Why this and not a ReID network: it needs no new model, no download, and no
// extra inference pass — the worker already has the decoded frame in memory.
// The interface (embed a crop, compare two vectors) is deliberately the same
// shape a proper ReID embedding would have, so one can replace the internals
// later without touching enrolment, storage, or the matcher.
// ─────────────────────────────────────────────────────────────────────────────

/** Horizontal bands down the body: roughly head, chest, waist, legs. */
export const BANDS = 4;
/** Hue buckets. Coarse on purpose — lighting shifts hue more than it shifts band order. */
export const HUE_BINS = 6;
/** Brightness buckets, which carry most of the signal indoors. */
export const VALUE_BINS = 4;
/** Length of one signature: bands x (hue bins + value bins). */
export const SIGNATURE_LENGTH = BANDS * (HUE_BINS + VALUE_BINS);
/** Standard embedding length for deep neural Person ReID models (e.g. OSNet / OmniScale). */
export const REID_EMBEDDING_LENGTH = 512;

/** Checks if a vector length matches either the color-histogram signature or neural ReID embedding. */
export function isValidSignatureLength(length: number): boolean {
  return length === SIGNATURE_LENGTH || length === REID_EMBEDDING_LENGTH;
}

export type AppearanceSignature = readonly number[];

export type CropSource = {
  /** RGBA pixels of the whole frame. */
  rgba: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
};

/** Pixel-space rectangle inside the frame. */
export type CropRect = { x: number; y: number; w: number; h: number };

/**
 * Build a signature from a person's crop.
 *
 * Returns null when the crop is too small to say anything honest about — a
 * 12-pixel-tall smudge at the back of a room produces a vector that will happily
 * match anyone, which is worse than declining.
 */
export function buildAppearanceSignature(
  frame: CropSource,
  rect: CropRect,
  minPixels = 24 * 48,
): AppearanceSignature | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(frame.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(frame.height, Math.ceil(rect.y + rect.h));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h < BANDS) return null;
  if (w * h < minPixels) return null;

  const signature = new Array<number>(SIGNATURE_LENGTH).fill(0);
  const bandCounts = new Array<number>(BANDS).fill(0);
  const bandHeight = h / BANDS;

  for (let y = y0; y < y1; y++) {
    const band = Math.min(BANDS - 1, Math.floor((y - y0) / bandHeight));
    const bandOffset = band * (HUE_BINS + VALUE_BINS);
    for (let x = x0; x < x1; x++) {
      const i = (y * frame.width + x) * 4;
      const r = frame.rgba[i] / 255;
      const g = frame.rgba[i + 1] / 255;
      const b = frame.rgba[i + 2] / 255;

      const { hue, sat, val } = rgbToHsv(r, g, b);

      // Near-grey pixels have a meaningless hue — a dark hoodie's "hue" is
      // whatever noise survived quantisation. Only count hue when the colour is
      // actually colourful; brightness is always counted.
      if (sat > 0.2) {
        const hueBin = Math.min(HUE_BINS - 1, Math.floor(hue * HUE_BINS));
        signature[bandOffset + hueBin] += 1;
      }
      const valBin = Math.min(VALUE_BINS - 1, Math.floor(val * VALUE_BINS));
      signature[bandOffset + HUE_BINS + valBin] += 1;
      bandCounts[band] += 1;
    }
  }

  // Normalise WITHIN each band, so a person who fills more of the frame does not
  // produce a systematically different vector from the same person further away.
  for (let band = 0; band < BANDS; band++) {
    const count = bandCounts[band];
    if (count === 0) continue;
    const offset = band * (HUE_BINS + VALUE_BINS);
    for (let k = 0; k < HUE_BINS + VALUE_BINS; k++) {
      signature[offset + k] /= count;
    }
  }

  return signature;
}

/** Cosine similarity, 0..1. Returns 0 for mismatched or empty vectors. */
export function similarity(a: AppearanceSignature, b: AppearanceSignature): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  const value = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Clamp: floating point can nudge an identical pair a hair above 1.
  return Math.max(0, Math.min(1, value));
}

export type EnrolledAppearance = {
  slug: string;
  displayName: string;
  /** Several references per person — different poses, distances, lighting. */
  signatures: AppearanceSignature[];
};

export type AppearanceMatch = {
  slug: string;
  displayName: string;
  score: number;
  /** How far clear of the runner-up. Small means "these two look alike today". */
  margin: number;
};

/**
 * Match a detection against everyone enrolled.
 *
 * Two gates, both required, and the second is the one that matters:
 *
 *  - `minScore` — the match must actually look like the person.
 *  - `minMargin` — it must look like them MORE THAN it looks like anyone else.
 *    Without this, two housemates in similar dark clothing both score 0.93 and
 *    the winner is decided by noise, producing a name that flips between two
 *    people frame to frame. Declining is the correct output there.
 *
 * Returns null when nothing clears both, which the caller must render as an
 * unnamed person rather than a guess.
 */
export function matchAppearance(
  probe: AppearanceSignature,
  enrolled: readonly EnrolledAppearance[],
  opts: { minScore?: number; minMargin?: number } = {},
): AppearanceMatch | null {
  const minScore = opts.minScore ?? 0.82;
  const minMargin = opts.minMargin ?? 0.04;

  const scored = enrolled
    .map((person) => ({
      person,
      // Best of that person's references: one bad enrolment frame should not
      // sink them, and a person legitimately looks different across poses.
      score: person.signatures.reduce((best, ref) => Math.max(best, similarity(probe, ref)), 0),
    }))
    .sort((a, b) => b.score - a.score || a.person.slug.localeCompare(b.person.slug));

  const top = scored[0];
  if (!top || top.score < minScore) return null;

  const runnerUp = scored[1]?.score ?? 0;
  const margin = top.score - runnerUp;
  if (scored.length > 1 && margin < minMargin) return null;

  return {
    slug: top.person.slug,
    displayName: top.person.displayName,
    score: Number(top.score.toFixed(4)),
    margin: Number(margin.toFixed(4)),
  };
}

/**
 * Match every subject in ONE frame at once, so no person is named twice.
 *
 * `matchAppearance` answers "who is this box", independently per box. Run it
 * across a frame and nothing stops two bodies both coming back TYLER — two
 * people standing in the game room, one of them actually Tyler, the other in a
 * similar jacket. The overlay would then state that Tyler is in two places, and
 * the director's targetMemberDetected would be steering on a duplicate.
 *
 * The arbitration is deliberately blunt: one identity per frame, awarded to the
 * strongest claim, and the loser goes UNNAMED rather than falling back to its
 * own runner-up. Falling back would be worse than it sounds — that runner-up is
 * a person the box already failed the margin gate against, so promoting it
 * turns a declined guess into a stated one purely because someone else was
 * standing nearby.
 *
 * A key with no entry in the returned map is unnamed, which is the correct and
 * expected outcome for most boxes most of the time.
 */
export function assignAppearances(
  probes: readonly { key: string; signature: AppearanceSignature | null }[],
  enrolled: readonly EnrolledAppearance[],
  opts: { minScore?: number; minMargin?: number } = {},
): Map<string, AppearanceMatch> {
  const claims: Array<{ key: string; match: AppearanceMatch }> = [];
  for (const probe of probes) {
    if (!probe.signature) continue;
    const match = matchAppearance(probe.signature, enrolled, opts);
    if (match) claims.push({ key: probe.key, match });
  }

  // Strongest claim first; key as the tiebreak so a frame with two identical
  // scores resolves the same way every time rather than by iteration order.
  claims.sort((a, b) => b.match.score - a.match.score || a.key.localeCompare(b.key));

  const assigned = new Map<string, AppearanceMatch>();
  const takenSlugs = new Set<string>();
  for (const claim of claims) {
    if (takenSlugs.has(claim.match.slug)) continue;
    takenSlugs.add(claim.match.slug);
    assigned.set(claim.key, claim.match);
  }
  return assigned;
}

function rgbToHsv(r: number, g: number, b: number): { hue: number; sat: number; val: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue /= 6;
    if (hue < 0) hue += 1;
  }

  return { hue, sat: max === 0 ? 0 : delta / max, val: max };
}
