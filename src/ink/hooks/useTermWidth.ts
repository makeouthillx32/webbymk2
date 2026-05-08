// src/ink/hooks/useTermWidth.ts
// ─────────────────────────────────────────────────────────────────────────────
// Returns the actual terminal column / row count, updated live on every resize.
// Listens for SIGWINCH so the TUI re-flows when the user resizes their window
// or connects from a narrow client (e.g. iOS SSH).
//
// No upper-bound — the layout adapts to whatever width the terminal reports,
// whether that is 40 or 400 columns.  A floor of 20 guards against the
// pathological zero-width reports some terminal emulators emit briefly during
// a resize event before settling on the final size.
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

const MIN_WIDTH = 20; // guard against transient zero-width reports

function currentWidth(): number {
  return Math.max(MIN_WIDTH, process.stdout.columns ?? 80);
}

// ── Module-level singleton ────────────────────────────────────────────────────
// One "resize" listener batches ALL subscriber updates (width + height) into a
// single unstable_batchedUpdates call → one React render, one Ink repaint.

type ValueSetter = (n: number) => void;

const widthSubs  = new Set<ValueSetter>();
const heightSubs = new Set<ValueSetter>();
let listenerActive = false;

function currentHeight(): number {
  return process.stdout.rows ?? 24;
}

function ensureListener(): void {
  if (listenerActive) return;
  listenerActive = true;
  process.stdout.on("resize", () => {
    const w = currentWidth();
    const h = currentHeight();
    // Batch ALL subscriber updates → single React render, single Ink repaint.
    unstable_batchedUpdates(() => {
      widthSubs.forEach((set)  => set(w));
      heightSubs.forEach((set) => set(h));
    });
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useTermWidth(): number {
  const [width, setWidth] = useState(currentWidth);

  useEffect(() => {
    ensureListener();
    widthSubs.add(setWidth);
      // Re-sync in case terminal size changed between render and effect commit
    setWidth(currentWidth());
    return () => { widthSubs.delete(setWidth); };
  }, []);

  return width;
}

export function useTermHeight(): number {
  const [height, setHeight] = useState(currentHeight);

  useEffect(() => {
    ensureListener();
    heightSubs.add(setHeight);
    setHeight(currentHeight());
    return () => { heightSubs.delete(setHeight); };
  }, []);

  return height;
}

/**
 * Common terminal measurements for layout components.
 *
 *   tw   — full outer box width  (border + padding included)
 *   iw   — inner content width   tw - 4  (2 border + 1 paddingX each side)
 *   dw   — divider width         tw - 6  (iw - 2 for a tiny side gap)
 *   th   — terminal row count    (used by AppShell to clamp content height)
 */
export function useWidths() {
  const tw = useTermWidth();
  const th = useTermHeight();
  return {
    tw,
    iw: tw - 4,
    dw: tw - 6,
    th,
  } as const;
}
