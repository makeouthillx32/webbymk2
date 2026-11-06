/** What the alt director's house says, for a page that shows it in its own
 * description line (Tank's Game mode). Lives apart from AltDirector3D so the
 * page can name it without pulling the 3D bundle in. */
export type AltDirectorHud = {
  place: string;
  shot: string;
  /** "Click to walk around…" while the canvas isn't focused. */
  hint: string | null;
  /** What they just looked at (E), for a few seconds. */
  note: { label: string; blurb: string } | null;
};
