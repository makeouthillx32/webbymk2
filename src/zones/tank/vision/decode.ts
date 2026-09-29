// src/zones/tank/vision/decode.ts
// ─────────────────────────────────────────────────────────────────────────────
// The vision DECODER, with no DOM in it.
//
// This is layer 2 of the vision stack (see
// vault/Architecture/tank-vision-stack-definition.md). It used to live inside
// PeopleDetectionEngine.tsx, welded to HTMLVideoElement, CanvasRenderingContext2D
// and a React effect — which is the single reason detection could only ever run
// in whichever browser had the operator console open. A 24/7 tracker cannot
// depend on a tab being open, so the maths had to come out of the component
// before anything else was possible.
//
// Everything here is pure: raw pixels in, boxes out. The browser feeds it canvas
// pixels; a server worker feeds it decoded frames. Neither one owns the logic,
// so the two can never drift into disagreeing about what was detected — the
// same reason CardOverlaySlots is shared between the storefront and its editor.
// ─────────────────────────────────────────────────────────────────────────────

/** Model input is square: the export is [1,3,640,640]. */
export const MODEL_SIZE = 640;
/** output0 is [1,84,8400] — 84 channels (4 box + 80 class) over 8400 anchors. */
export const NUM_ANCHORS = 8400;

export const MIN_SCORE = 0.5;
export const MAX_DETECTIONS = 20;
export const IOU_THRESHOLD = 0.45;

/**
 * COCO indices this decoder reads, and the label each becomes.
 *
 * Standard COCO ordering: 0=person, 15=cat, 16=dog. The weights know all 80
 * classes; these are the three the house cares about.
 */
export const DETECTED_CLASSES: Record<number, string> = {
  0: "person",
  15: "cat",
  16: "dog",
};

/**
 * Labels that cannot describe the same physical animal.
 *
 * A person and a dog may legitimately overlap — someone holding a pet — so
 * those must not suppress each other. But one animal is never both a cat and a
 * dog, and the model routinely scores a dog as a plausible cat.
 */
export const MUTUALLY_EXCLUSIVE = new Set(["cat", "dog"]);

export type LetterboxInfo = { scale: number; padX: number; padY: number };

export type Box = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
  label: string;
};

export type NormalizedDetection = {
  nx: number;
  ny: number;
  nw: number;
  nh: number;
  label: string;
  confidence: number;
};

/**
 * Geometry for fitting a frame into the square model input without stretching.
 *
 * Stretching a 16:9 frame into a square distorts people enough to measurably
 * hurt accuracy, so the frame is scaled to fit and the remainder padded. The
 * returned values are what map boxes back out of padded space onto real pixels.
 *
 * Pure maths — the caller does the actual drawing, because that is the only
 * part that differs between a canvas and a server-side frame buffer.
 */
export function computeLetterbox(frameWidth: number, frameHeight: number): LetterboxInfo {
  const scale = Math.min(MODEL_SIZE / frameWidth, MODEL_SIZE / frameHeight);
  const nw = Math.round(frameWidth * scale);
  const nh = Math.round(frameHeight * scale);
  return {
    scale,
    padX: Math.floor((MODEL_SIZE - nw) / 2),
    padY: Math.floor((MODEL_SIZE - nh) / 2),
  };
}

/**
 * Map a normalized detection box back onto the padded MODEL_SIZE buffer.
 *
 * The inverse of what parseYoloOutput does on the way out, and the piece that
 * makes a detection's own pixels reachable again. Boxes leave the decoder in
 * SOURCE-frame fractions (0-1 of the original 4K frame), but the only pixels a
 * caller still holds are the letterboxed 640x640 buffer that was fed to the
 * model — so reading a person's crop means going back through the same scale
 * and padding.
 *
 * Getting this wrong is quiet rather than loud: an off-by-padding crop reads a
 * strip of black bar plus half a body, produces a perfectly well-formed
 * signature, and simply never matches anyone. Hence it lives here next to
 * computeLetterbox rather than being re-derived at each call site.
 */
export function normalizedBoxToModelRect(
  box: { nx: number; ny: number; nw: number; nh: number },
  letterbox: LetterboxInfo,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; w: number; h: number } {
  const { scale, padX, padY } = letterbox;
  return {
    x: box.nx * frameWidth * scale + padX,
    y: box.ny * frameHeight * scale + padY,
    w: box.nw * frameWidth * scale,
    h: box.nh * frameHeight * scale,
  };
}

/**
 * RGBA pixels → planar CHW float32 normalized 0-1, the shape ONNX Runtime wants.
 *
 * Takes a plain Uint8ClampedArray rather than a canvas context so a server
 * worker can hand over an ffmpeg frame buffer unchanged.
 */
export function rgbaToTensor(rgba: Uint8ClampedArray | Uint8Array): Float32Array {
  const plane = MODEL_SIZE * MODEL_SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const j = i * 4;
    out[i] = rgba[j] / 255;
    out[plane + i] = rgba[j + 1] / 255;
    out[2 * plane + i] = rgba[j + 2] / 255;
  }
  return out;
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

export function competesWith(a: string, b: string): boolean {
  if (a === b) return true;
  return MUTUALLY_EXCLUSIVE.has(a) && MUTUALLY_EXCLUSIVE.has(b);
}

/**
 * Greedy NMS. Competes same-label boxes AND mutually exclusive ones, so a dog
 * and a cat claiming the same pixels resolve to whichever the model actually
 * believed more, instead of both being drawn.
 */
export function nonMaxSuppression(boxes: Box[]): Box[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: Box[] = [];
  for (const box of sorted) {
    if (kept.every((k) => !competesWith(k.label, box.label) || iou(k, box) < IOU_THRESHOLD)) {
      kept.push(box);
    }
    if (kept.length >= MAX_DETECTIONS) break;
  }
  return kept;
}

/**
 * Decode YOLOv8 output into normalized detections.
 *
 * output0 is channel-major, not per-anchor rows: anchor `a` of channel `c` is
 * `data[c * NUM_ANCHORS + a]`. Channels 0-3 are box cx/cy/w/h in padded
 * 640-space; 4-83 are the 80 class scores, already final probabilities
 * (Ultralytics' export bakes that in — no separate sigmoid step).
 *
 * One anchor describes ONE object, so it gets ONE label: the argmax. Emitting a
 * candidate per class above threshold is what made a single dog produce both a
 * dog box and a cat box at identical coordinates.
 */
export function parseYoloOutput(
  data: Float32Array,
  letterbox: LetterboxInfo,
  frameWidth: number,
  frameHeight: number,
): NormalizedDetection[] {
  const { scale, padX, padY } = letterbox;
  const candidates: Box[] = [];

  for (let a = 0; a < NUM_ANCHORS; a++) {
    let bestLabel: string | null = null;
    let bestScore = 0;
    for (const [classIndex, label] of Object.entries(DETECTED_CLASSES)) {
      const score = data[(4 + Number(classIndex)) * NUM_ANCHORS + a];
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }
    if (!bestLabel || bestScore < MIN_SCORE) continue;

    const cx = data[0 * NUM_ANCHORS + a];
    const cy = data[1 * NUM_ANCHORS + a];
    const w = data[2 * NUM_ANCHORS + a];
    const h = data[3 * NUM_ANCHORS + a];

    candidates.push({
      x1: (cx - w / 2 - padX) / scale,
      y1: (cy - h / 2 - padY) / scale,
      x2: (cx + w / 2 - padX) / scale,
      y2: (cy + h / 2 - padY) / scale,
      score: bestScore,
      label: bestLabel,
    });
  }

  return nonMaxSuppression(candidates).map((b) => {
    const x1 = Math.max(0, b.x1);
    const y1 = Math.max(0, b.y1);
    const x2 = Math.min(frameWidth, b.x2);
    const y2 = Math.min(frameHeight, b.y2);
    return {
      nx: x1 / frameWidth,
      ny: y1 / frameHeight,
      nw: (x2 - x1) / frameWidth,
      nh: (y2 - y1) / frameHeight,
      label: b.label,
      confidence: b.score,
    };
  });
}
