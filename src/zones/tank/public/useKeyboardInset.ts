"use client";

import { useEffect, useState } from "react";

/**
 * How much of the viewport is currently covered by the on-screen keyboard.
 *
 * iOS Safari does NOT resize the layout viewport when the keyboard opens — it
 * slides the visual viewport up over the page. A `position: fixed` element
 * anchored to the bottom therefore stays exactly where it was and ends up
 * behind the keyboard, which is why a chat input can be visible, focusable,
 * and completely unusable at the same time.
 *
 * visualViewport is the only API that reports this. Returns 0 on desktop, on
 * Android (which does resize the layout viewport), and whenever the keyboard
 * is closed — so it is safe to add unconditionally.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // The gap between the layout viewport bottom and the visual viewport
      // bottom is the keyboard (plus any browser chrome overlaying content).
      const covered = window.innerHeight - (vv.height + vv.offsetTop);
      // Small non-zero values are just the dynamic URL bar, not a keyboard.
      // Treating those as a keyboard would make the chat jitter while
      // scrolling, which is worse than ignoring them.
      setInset(covered > 80 ? Math.round(covered) : 0);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

export default useKeyboardInset;
