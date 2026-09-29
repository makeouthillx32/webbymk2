"use client";

import { useEffect, useState } from "react";
import { useOverlaySettings } from "./useOverlaySettings";
import { resolveActiveOverlayFx, type ActiveOverlayFx } from "./overlayFx";

/**
 * The live chaos fx, if any — for the HUD and VU overlays.
 *
 * Subscribes to the "fx" overlay settings row (fetched on mount, pushed live
 * over the existing realtime broadcast) and re-evaluates expiry on a timer so
 * a finished fx drops off even if no new broadcast ever arrives. The overlays
 * treat it as an override on top of their configured texture, never as a
 * replacement for it.
 */
export function useOverlayFx(): ActiveOverlayFx {
  const stored = useOverlaySettings("fx", true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return resolveActiveOverlayFx(stored, now);
}
