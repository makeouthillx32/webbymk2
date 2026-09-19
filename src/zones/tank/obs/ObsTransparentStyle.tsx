import React from "react";

/**
 * Force the document transparent from the FIRST PAINT, not after hydration.
 *
 * `useObsTransparentPage` does the same job in an effect, and standalone that
 * is fine — one focused page hydrates immediately and the green is gone before
 * anyone sees it. Inside the house compositor it is not fine: that canvas
 * mounts six small iframes at once, Chromium deprioritises offscreen and
 * throttled frames, and until each one hydrates the only thing painting the
 * body is TankThemeStyles' `background-color: #637F6D`. The result is a grid of
 * solid sage-green rectangles sitting on top of the programme — every overlay
 * looking broken, while each page opened on its own looks perfect.
 *
 * A <style> rendered as part of the markup arrives with the HTML and applies
 * before a single line of JavaScript runs, so there is no window in which the
 * overlay is opaque.
 *
 * `!important` is load-bearing. TankThemeStyles injects `html, body {
 * background-color: ... }` into a stylesheet of its own, and the two are
 * ordinary rules of equal specificity — whichever lands later wins. Since that
 * one is injected from an effect, it can land AFTER this one. `!important`
 * removes the race entirely rather than depending on mount order.
 *
 * Render it only on routes that exist to be a browser source. It is deliberately
 * not part of the overlay components themselves, because those also render
 * composed inside DirectorObsScene, and a component reaching out to repaint a
 * page it does not own is how this kind of bug spreads.
 */
export function ObsTransparentStyle() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
html, body {
  background: transparent !important;
  background-color: transparent !important;
  margin: 0 !important;
  overflow: hidden !important;
}

/*
 * The one that actually mattered.
 *
 * Clearing html and body is not enough, because the Tank layout wraps every
 * page in a full-height element carrying an INLINE background:
 *
 *   <main class="min-h-screen" style="background-color:hsl(var(--background))">
 *
 * and TankThemeStyles sets --background to 141.43 12.39% 44.31% — the theme
 * green. A transparent body behind an opaque full-viewport child is still a
 * green rectangle, which is exactly what every overlay showed.
 *
 * This works only because an !important author rule outranks a non-important
 * inline style. Without !important a stylesheet could never beat that attribute.
 *
 * Safe to apply to every <main> here: this style renders only on routes that
 * exist to be an OBS browser source, where nothing should be painting a
 * background at all — the overlays themselves are fixed, transparent layers.
 */
main,
body > main,
[data-layout="minimal"] {
  background: transparent !important;
  background-color: transparent !important;
}
`,
      }}
    />
  );
}

export default ObsTransparentStyle;
