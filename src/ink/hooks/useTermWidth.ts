// src/ink/hooks/useTermWidth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns the terminal column count clamped to our supported range.
// Listens for SIGWINCH (terminal resize) so the TUI re-flows when the user
// resizes their window or connects from a narrow client (e.g. iOS SSH).
//
//   MIN  44  — narrowest usable (phones in portrait, small SSH clients)
//   MAX  76  — designed maximum (desktop terminals)
//
// ── Singleton design ──────────────────────────────────────────────────────────
//
// PROBLEM: when multiple components each call useTermWidth() they each register
// an independent "resize" listener on process.stdout.  On every resize event N
// separate setState calls fire, triggering N separate Ink re-renders.  Ink
// repaints by moving the cursor up and overwriting — rapid sequential repaints
// leave stale lines visible ("screen duplicating").
//
// FIX: one module-level listener notifies all subscribers inside a single
// unstable_batchedUpdates() call so the whole tree re-renders exactly once per
// resize event regardless of how many components are mounted.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect }     from "react";
import { unstable_batchedUpdates } from "react-dom";

const MIN_WIDTH = 44;
const MAX_WIDTH = 76;

function clamp(cols: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, cols));
}

function currentWidth(): number {
  return clamp(process.stdout.columns ?? MAX_WIDTH);
}

// ── Module-level singleton ────────────────────────────────────────────────────

type WidthSetter = (w: number) => void;
const subscribers   = new Set<WidthSetter>();
let listenerActive  = false;

function ensureListener(): void {
  if (listenerActive) return;
  listenerActive = true;
  process.stdout.on("resize", () => {
    const w = currentWidth();
    // Batch ALL subscriber updates → single React render, single Ink repaint.
    unstable_batchedUpdates(() => {
      subscribers.forEach((set) => set(w));
    });
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTermWidth(): number {
  const [width, setWidth] = useState(currentWidth);

  useEffect(() => {
    ensureListener();
    subscribers.add(setWidth);
    // Re-sync in case terminal size changed between render and effect commit
    setWidth(currentWidth());
    return () => { subscribers.delete(setWidth); };
  }, []);

  return width;
}

/**
 * Given the outer shell width, derive common inner measurements.
 *
 *   tw   — full outer box width  (border + padding included)
 *   iw   — inner content width   tw - 4  (2 border + 1 paddingX each side)
 *   dw   — divider width         tw - 6  (iw - 2 for a tiny side gap)
 */
export function useWidths() {
  const tw = useTermWidth();
  return {
    tw,
    iw: tw - 4,
    dw: tw - 6,
  } as const;
}
