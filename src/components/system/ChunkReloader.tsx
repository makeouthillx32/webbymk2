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
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from "react";

const RELOAD_KEY = "__chunk_reload_ts";
const THROTTLE_MS = 10_000;

function isChunkError(value: unknown): boolean {
  if (!value) return false;
  const s = typeof value === "string" ? value : String((value as any)?.message ?? (value as any)?.name ?? "");
  return (
    /ChunkLoadError/i.test(s) ||
    /Loading chunk [^ ]+ failed/i.test(s) ||
    /Loading CSS chunk/i.test(s) ||
    /Failed to fetch dynamically imported module/i.test(s)
  );
}

export default function ChunkReloader() {
  useEffect(() => {
    const reloadOnce = () => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last < THROTTLE_MS) return; // already tried recently — avoid loop
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        /* sessionStorage unavailable — fall through to reload */
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
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
