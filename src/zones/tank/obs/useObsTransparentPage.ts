"use client";

import { useEffect } from "react";

/**
 * Make the whole document see-through, for the life of a browser-source page.
 *
 * An OBS Browser Source composites the ENTIRE document, not just the root
 * element, and the Tank layout paints an opaque theme colour onto `<body>`
 * (#637F6D). Without this an overlay renders a solid green rectangle across the
 * scene even while it has nothing to show — the exact opposite of what an
 * overlay is for. It has been caught in the browser rather than in review more
 * than once (see the OBS room-offline overlay), which is precisely why it now
 * lives in one place instead of being re-typed into each overlay.
 *
 * `enabled` is the composed-vs-standalone switch. Every director overlay can
 * render inside DirectorObsScene as well as on its own route, and inside the
 * scene it must NOT touch the document: the scene owns its own background, and
 * an overlay quietly forcing `body` transparent there would be a component
 * reaching outside itself to change a page it does not own.
 *
 * The previous values are restored on unmount rather than being reset to a
 * hardcoded default, so nothing is assumed about what the page looked like
 * before — including the case where two overlays mount on one page.
 */
export function useObsTransparentPage(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    const html = document.documentElement;
    const body = document.body;
    const previous = {
      htmlBackground: html.style.background,
      bodyBackground: body.style.background,
      bodyOverflow: body.style.overflow,
      bodyMargin: body.style.margin,
    };

    html.style.background = "transparent";
    body.style.background = "transparent";
    body.style.overflow = "hidden";
    body.style.margin = "0";

    return () => {
      html.style.background = previous.htmlBackground;
      body.style.background = previous.bodyBackground;
      body.style.overflow = previous.bodyOverflow;
      body.style.margin = previous.bodyMargin;
    };
  }, [enabled]);
}
