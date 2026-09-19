"use client";

import { useEffect, useRef } from "react";
import {
  BUILD_POLL_INTERVAL_MS,
  decideBuildReload,
  reloadDelayMs,
  type BuildReloadState,
} from "./buildReload";

/**
 * Reload this browser source when Tank is redeployed.
 *
 * Every rebuild used to leave every OBS source on the previous bundle until
 * someone right-clicked each one and chose "Refresh cache of current page".
 * Forgetting meant a source quietly serving stale JS — which is how a verify
 * screen sat all morning with server actions keyed to a build that no longer
 * existed, failing silently on every poll.
 *
 * Only ever runs on standalone browser-source pages. It is NOT used on the
 * house site: a viewer mid-session should not have the page yanked out from
 * under them because staff shipped something.
 *
 * All of the judgement lives in decideBuildReload — see that file for why a
 * failed poll must be indistinguishable from "do nothing".
 */
export function useBuildReload(enabled = true): void {
  const stateRef = useRef<BuildReloadState>({ seen: null });
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || reloadingRef.current) return;
      let buildId: string | null = null;
      try {
        const response = await fetch("/api/tank/build", { cache: "no-store" });
        if (response.ok) {
          const payload = (await response.json()) as { buildId?: unknown };
          buildId = typeof payload?.buildId === "string" ? payload.buildId : null;
        }
      } catch {
        // Silence. A blip during a deploy is the most likely cause, and
        // reloading on it is precisely the wrong response.
      }
      if (cancelled) return;

      const decision = decideBuildReload(stateRef.current, buildId);
      if (decision.action === "adopt") {
        stateRef.current = { seen: decision.buildId };
        return;
      }
      if (decision.action !== "reload") return;

      // Latch before the delay: a second poll landing inside the stagger must
      // not schedule a second reload on top of the first.
      reloadingRef.current = true;
      const delay = reloadDelayMs();
      console.info(
        `[TankBuildReload] new build ${decision.to} (was ${decision.from}) — reloading in ${delay}ms`,
      );
      timer = setTimeout(() => {
        if (!cancelled) window.location.reload();
      }, delay);
    };

    void poll();
    const interval = setInterval(() => void poll(), BUILD_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}
