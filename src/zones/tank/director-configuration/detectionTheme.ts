// Visual language for the director's detection overlay.
//
// One accent colour, everything else neutral. The overlay this replaced used
// eight colours across ninety-odd usages — emerald, cyan, purple, amber, red,
// orange — which meant colour carried no information: if everything is
// highlighted, nothing is. Here amber means "the system detected this" and
// nothing else uses it, so the eye goes straight to the detections.
//
// Red is reserved for exactly one thing: ground contact. It is the only marker
// that denotes a physical position rather than a classification, and keeping it
// unique is what lets a director read foot placement at a glance.
//
// None of this ever reaches a viewer. The public feed at tank.unenter.live
// renders clean video; this is instrumentation for the director only.

export const DETECTION = {
  /** Everything the detector found. The only saturated colour in the overlay. */
  accent: "#FFC53D",
  accentDim: "rgba(255, 197, 61, 0.45)",
  accentFaint: "rgba(255, 197, 61, 0.14)",

  /** Ground-contact / foot placement. Reserved, never used for anything else. */
  ground: "#FF3B30",

  /** Panel and card backgrounds — dark enough to stay readable over any room. */
  panel: "rgba(14, 14, 16, 0.86)",
  panelBorder: "rgba(255, 255, 255, 0.14)",

  text: "#FFFFFF",
  textDim: "rgba(255, 255, 255, 0.62)",

  /** Stroke weights, in px. Thin enough not to swallow a distant subject. */
  boxStroke: 2,
  leaderStroke: 1,
} as const;

/**
 * Confidence shown as opacity rather than as another colour.
 *
 * A low-confidence detection should look uncertain without introducing a
 * second hue that competes with the accent for attention.
 */
export function confidenceOpacity(confidence: number): number {
  const c = Math.max(0, Math.min(1, confidence));
  // Floor at 0.35 so a weak detection is still visible — invisible is worse
  // than uncertain, because the director cannot judge what they cannot see.
  return 0.35 + c * 0.65;
}

/** Monospace stack for label:value rows, matching the reference HUD. */
export const DETECTION_MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
