"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ChunkReloader
//
// Self-heals "ChunkLoadError: Loading chunk … failed" errors. These happen when
// the page was loaded against an older build (dev recompile or prod deploy) and
// then client-navigation requests a chunk hash that no longer matches. The chunk
// itself exists on a fresh load, so a single full reload fixes it.
//
// A sessionStorage throttle prevents reload loops if a chunk is genuinely gone.
//
// Incident 2026-08-08: a stale tab left open across several same-session core
// zone rebuilds hit a persistently mismatched chunk hash — every reload
// fetched fresh HTML that referenced yet another now-superseded hash while
// the rebuild churn continued, so the time-only throttle below (10s) never
// stopped it: users saw an effectively infinite reload loop, reported as
// "reboot loop" / "reloading every ~20 seconds". Fixed by adding a hard
// attempt cap alongside the time throttle — after MAX_ATTEMPTS, stop
// reloading and let the user recover manually instead of hammering forever.
// See vault/Logs/2026-08-08.md and vault postmortem for full writeup.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

const RELOAD_KEY = "__chunk_reload_ts";
const COUNT_KEY = "__chunk_reload_count";
const WINDOW_KEY = "__chunk_reload_window_start";
const THROTTLE_MS = 10_000;
const ATTEMPT_WINDOW_MS = 60_000;
const SUCCESS_RESET_MS = 15_000;
const MAX_ATTEMPTS = 3;

let g_fallbackLastReload = 0;
let g_fallbackReloadCount = 0;

function isChunkError(value: unknown): boolean {
  if (!value) return false;
  const s = typeof value === "string" ? value : String((value as any)?.message ?? (value as any)?.name ?? "");
  return (
    (/ChunkLoadError/i.test(s) ||
      /Loading chunk [^ ]+ failed/i.test(s) ||
      /Loading CSS chunk/i.test(s)) &&
    !/onnxruntime/i.test(s) &&
    !/yolov8/i.test(s) &&
    !/models\//i.test(s)
  );
}

export default function ChunkReloader() {
  useEffect(() => {
    const reloadOnce = () => {
      const now = Date.now();
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (now - last < THROTTLE_MS) return; // already tried recently — avoid loop

        const storedWindowStart = Number(
          sessionStorage.getItem(WINDOW_KEY) || 0,
        );
        const windowStart =
          storedWindowStart > 0 && now - storedWindowStart < ATTEMPT_WINDOW_MS
            ? storedWindowStart
            : now;
        const previousAttempts =
          windowStart === storedWindowStart
            ? Number(sessionStorage.getItem(COUNT_KEY) || 0)
            : 0;

        const attempts = previousAttempts + 1;
        if (attempts > MAX_ATTEMPTS) {
          console.error(
            `[ChunkReloader] Giving up after ${MAX_ATTEMPTS} reload attempts — chunk mismatch persists. Manual refresh required.`
          );
          return;
        }

        sessionStorage.setItem(WINDOW_KEY, String(windowStart));
        sessionStorage.setItem(RELOAD_KEY, String(now));
        sessionStorage.setItem(COUNT_KEY, String(attempts));
      } catch {
        // In-memory fallback if sessionStorage is blocked/unavailable
        if (now - g_fallbackLastReload < THROTTLE_MS) return;
        g_fallbackLastReload = now;
        g_fallbackReloadCount += 1;
        if (g_fallbackReloadCount > MAX_ATTEMPTS) {
          console.error(
            `[ChunkReloader] Giving up after ${MAX_ATTEMPTS} fallback attempts.`
          );
          return;
        }
      }
      window.location.reload();
    };

    const onError = (e: ErrorEvent) => {
      if (isChunkError(e?.error) || isChunkError(e?.message)) reloadOnce();
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isChunkError(e?.reason)) reloadOnce();
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    // A page that remains mounted has successfully crossed the stale-chunk
    // danger window. Reset the incident budget so a deployment days later is
    // not rejected because Safari retained three ancient attempts.
    const successReset = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_KEY);
        sessionStorage.removeItem(COUNT_KEY);
        sessionStorage.removeItem(WINDOW_KEY);
      } catch {}
    }, SUCCESS_RESET_MS);
    return () => {
      window.clearTimeout(successReset);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
