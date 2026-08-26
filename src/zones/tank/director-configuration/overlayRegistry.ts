import type { SubjectMode } from "../server/directorVirtualAtlas";

// Every overlay the director can draw, in one list.
//
// Built as a registry rather than a fixed set of boolean props because the
// plan is roughly twenty of these. Adding the twenty-first should mean one
// entry here and nothing else — no new prop threaded through the canvas, no
// new checkbox hand-placed in a panel, no third copy of the same conditional.
//
// The toggles exist for readability, not correctness: with enough detectors
// running, a frame becomes unreadable long before it becomes wrong. Turning
// layers off is how a director finds the one thing they are looking for.
// Detection continues regardless of what is drawn — hiding a layer never
// changes which camera wins the cut.

export type OverlayId =
  | "person"
  | "member"
  | "guest"
  | "feet"
  | "audio"
  | "motion"
  | "depth"
  | "trash"
  | "clutter"
  | "easterEgg"
  | "waldo"
  | "items"
  | "grid";

export type OverlayGroup = "subjects" | "signals" | "objects" | "reference";

export type OverlayDefinition = {
  id: OverlayId;
  label: string;
  group: OverlayGroup;
  /** Shown by default. Keep this list short — a loud default is a useless one. */
  defaultOn: boolean;
  /** One line, shown on hover. Say what it draws, not what it means. */
  hint: string;
  /**
   * Modes where this layer is worth seeing. Empty means always relevant.
   * Used to auto-suggest a sensible set when the operator changes mode, so
   * switching to `group` does not leave twelve irrelevant layers on screen.
   */
  relevantModes?: SubjectMode[];
};

export const OVERLAY_DEFINITIONS: OverlayDefinition[] = [
  // ── Subjects: who is in the room ────────────────────────────────────────
  {
    id: "person",
    label: "People",
    group: "subjects",
    defaultOn: true,
    hint: "Box around every detected body",
  },
  {
    id: "member",
    label: "House members",
    group: "subjects",
    defaultOn: true,
    hint: "Names a body matched to an enrolled housemate",
  },
  {
    id: "guest",
    label: "Guests",
    group: "subjects",
    defaultOn: true,
    hint: "Marks a body that matched nobody enrolled",
  },
  {
    id: "feet",
    label: "Ground contact",
    group: "subjects",
    defaultOn: false,
    hint: "Red dot where a person meets the floor",
    relevantModes: ["feet"],
  },

  // ── Signals: what the room is doing ─────────────────────────────────────
  {
    id: "audio",
    label: "Audio",
    group: "signals",
    defaultOn: true,
    hint: "Level, and how far above this room's own normal",
    relevantModes: ["speaker", "auto", "chaos"],
  },
  {
    id: "motion",
    label: "Motion",
    group: "signals",
    defaultOn: false,
    hint: "Frame-to-frame movement score",
    relevantModes: ["motion", "chaos"],
  },
  {
    id: "depth",
    label: "Depth zones",
    group: "signals",
    defaultOn: false,
    hint: "Foreground / midground / background banding",
  },

  // ── Objects: what is lying around ───────────────────────────────────────
  { id: "trash", label: "Trash", group: "objects", defaultOn: false, hint: "Rubbish left in frame" },
  { id: "clutter", label: "Clutter", group: "objects", defaultOn: false, hint: "Objects out of place" },
  { id: "easterEgg", label: "Easter eggs", group: "objects", defaultOn: false, hint: "Hidden items placed for viewers" },
  { id: "waldo", label: "Waldo", group: "objects", defaultOn: false, hint: "The find-me target" },
  { id: "items", label: "Item triggers", group: "objects", defaultOn: false, hint: "Viewer-triggered item effects" },

  // ── Reference ───────────────────────────────────────────────────────────
  { id: "grid", label: "Canvas grid", group: "reference", defaultOn: false, hint: "Atlas tile boundaries" },
];

export type OverlayVisibility = Record<OverlayId, boolean>;

export function defaultOverlayVisibility(): OverlayVisibility {
  const out = {} as OverlayVisibility;
  for (const def of OVERLAY_DEFINITIONS) out[def.id] = def.defaultOn;
  return out;
}

/**
 * The layers worth seeing in a given mode.
 *
 * Offered as a suggestion the operator can apply, never forced — someone
 * debugging a bad cut often wants precisely the layers the mode says are
 * irrelevant.
 */
export function suggestedForMode(mode: SubjectMode): OverlayVisibility {
  const out = {} as OverlayVisibility;
  for (const def of OVERLAY_DEFINITIONS) {
    out[def.id] = !def.relevantModes ? def.defaultOn : def.relevantModes.includes(mode);
  }
  // Bodies are the anchor for everything else; never suggest hiding them.
  out.person = true;
  return out;
}

export function overlaysByGroup(group: OverlayGroup): OverlayDefinition[] {
  return OVERLAY_DEFINITIONS.filter((d) => d.group === group);
}
