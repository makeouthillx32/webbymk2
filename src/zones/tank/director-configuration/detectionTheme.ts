// Visual language for the director's detection overlay.
//
// One fixed color per detection class, matching the convention used by
// essentially every real detection tool (Roboflow, CVAT, Ultralytics' own
// `Annotator`, DeepStream's OSD) — an operator learns "cyan is a dog" once
// and it holds everywhere. This replaced an earlier "one accent colour,
// everything else neutral" design (2026-08 era) that had already drifted in
// practice — trash, clutter, and pets had each quietly grown their own
// color anyway, because a single shared color stopped being distinguishable
// the moment more than one class could appear in the same frame. Rather than
// re-enforce a philosophy the code had already abandoned, this formalizes
// what was actually happening into CLASS_COLORS: one deliberate, readable
// palette instead of ad hoc literals scattered across box-rendering code.
//
// Red is reserved for exactly one thing: ground contact. It is the only
// marker that denotes a physical position rather than a classification, and
// keeping it unique is what lets a director read foot placement at a glance
// — it must never be reused as a class color.
//
// None of this ever reaches a viewer. The public feed at tank.unenter.live
// renders clean video; this is instrumentation for the director only.

export const DETECTION = {
  /** Fallback for any class without its own CLASS_COLORS entry. */
  accent: "#FFC53D",
  accentDim: "rgba(255, 197, 61, 0.45)",
  accentFaint: "rgba(255, 197, 61, 0.14)",

  /** Ground-contact / foot placement. Reserved, never used as a class color. */
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
 * One fixed, distinct color per detection class — the single source of
 * truth for box borders, label-tag backgrounds, and the on-canvas legend.
 * Chosen for mutual separation (no two classes read as the same hue) and to
 * stay clear of DETECTION.ground (#FF3B30), which no class may ever use.
 */
export const CLASS_COLORS: Record<string, { border: string; bg: string; badgeBg: string; badgeText: string; label: string }> = {
  person: { border: "#FFC53D", bg: "rgba(255, 197, 61, 0.14)", badgeBg: "#FFC53D", badgeText: "#141414", label: "Person" },
  dog: { border: "#22D3EE", bg: "rgba(34, 211, 238, 0.14)", badgeBg: "#22D3EE", badgeText: "#0A1A1F", label: "Dog" },
  cat: { border: "#A78BFA", bg: "rgba(167, 139, 250, 0.14)", badgeBg: "#A78BFA", badgeText: "#160D2E", label: "Cat" },
  trash: { border: "#FF4D00", bg: "rgba(255, 77, 0, 0.18)", badgeBg: "#FF4D00", badgeText: "#FFFFFF", label: "Trash" },
  clutter: { border: "#A3E635", bg: "rgba(163, 230, 53, 0.14)", badgeBg: "#A3E635", badgeText: "#152400", label: "Clutter" },
};

export function classColor(label: string) {
  const raw = (label || "").toLowerCase();
  // "trash" also matches label variants that merely contain it (e.g. a
  // future "likely_trash" from a real detector) — same fuzzy rule already
  // used for filtering/title logic elsewhere, kept consistent here.
  const key = raw in CLASS_COLORS ? raw : raw.includes("trash") ? "trash" : raw;
  return CLASS_COLORS[key] ?? {
    border: DETECTION.accent,
    bg: "transparent",
    badgeBg: DETECTION.accent,
    badgeText: "#141414",
    label: label || "Object",
  };
}

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
