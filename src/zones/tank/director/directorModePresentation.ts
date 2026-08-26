import type { ServerDirectorMode } from "../server/serverDirectorEngine";

// How each director mode is spelled for a human. Keyed on the mode vocabulary
// the director engine actually emits (ServerDirectorMode), not a parallel list
// — an earlier second union meant nothing the engine reported ever matched.
//
// To add a mode: add it to ServerDirectorMode in serverDirectorEngine.ts and
// add an entry here. The Record type makes a missing entry a compile error, so
// a new mode can't ship rendering as a blank label.
export type DirectorModePresentation = {
  /** Human label for the mode itself. Never a room name. */
  label: string;
  /** Tailwind text colour class for the label. */
  text: string;
  /** Tailwind classes for the status dot. */
  dot: string;
};

export const DIRECTOR_MODE_PRESENTATION: Record<ServerDirectorMode, DirectorModePresentation> = {
  STANDBY: {
    label: "STANDBY",
    text: "text-amber-400",
    dot: "bg-amber-400 shadow-[0_0_8px_#fbbf24]",
  },
  // Kept as the fallback label for AUTO_TRACKING — used only until the first
  // real tick lands, or if a reason string ever fails to parse. Once real
  // subject-mode scoring is live (see getDirectorModePresentation below),
  // AUTO_TRACKING almost never shows this literally.
  AUTO_TRACKING: {
    label: "AUTO TRACKING",
    text: "text-cyan-400",
    dot: "bg-cyan-400 shadow-[0_0_8px_#22d3ee]",
  },
  ATTENTION: {
    label: "ATTENTION LOCK",
    text: "text-[#ff4d00]",
    dot: "bg-[#ff4d00] shadow-[0_0_8px_#ff4d00]",
  },
};

const UNKNOWN_DIRECTOR_MODE: DirectorModePresentation = {
  label: "INITIALIZING",
  text: "text-slate-300",
  dot: "bg-slate-400 shadow-[0_0_8px_#94a3b8]",
};

// What AUTO_TRACKING actually means right now, since it stopped meaning only
// "audio" the moment real subject-mode scoring was wired into the engine —
// it can be driven by speaker, crowd, feet, face, motion or chaos scoring, and
// nerd stats showed the same generic "AUDIO TRACKING" for all of them
// regardless of which one was actually running.
//
// The engine already tags every AUTO_TRACKING cut with the subject mode at
// the front of `reason` (e.g. "[SPEAKER] Kitchen scored 87 · ..."), so that is
// read back out here rather than adding a second field that could drift out
// of sync with what the engine actually did.
const SUBJECT_MODE_LABELS: Record<string, string> = {
  AUTO: "AUTO TRACKING",
  PERSON: "PERSON TRACKING",
  SPEAKER: "SPEAKER TRACKING",
  FEET: "FEET TRACKING",
  FACE: "FACE LOCK",
  MOTION: "MOTION TRACKING",
  CROWD: "GROUP TRACKING",
  CHAOS: "CHAOS MODE",
  MANUAL: "MANUAL",
};

function subjectModeFromReason(reason?: string): string | null {
  const match = reason?.match(/^\[([A-Z_]+)\]/);
  return match ? match[1] : null;
}

export function getDirectorModePresentation(
  mode?: ServerDirectorMode,
  reason?: string,
): DirectorModePresentation {
  const base = (mode && DIRECTOR_MODE_PRESENTATION[mode]) || UNKNOWN_DIRECTOR_MODE;
  if (mode !== "AUTO_TRACKING") return base;

  const tag = subjectModeFromReason(reason);
  const label = tag && SUBJECT_MODE_LABELS[tag];
  return label ? { ...base, label } : base;
}
