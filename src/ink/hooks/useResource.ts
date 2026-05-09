// src/ink/hooks/useResource.ts
// ─────────────────────────────────────────────────────────────────────────────
// Generic "Fetch → Load → Poll → Select" lifecycle hook.
//
// Handles the boilerplate that was duplicated across useZoneManager (zone list)
// and NpmPanel (proxy host list):
//   • Initial fetch on mount (or when `enabled` flips true)
//   • Background polling on a fixed interval (silent — no loading flash)
//   • Auto-clamped cursor selection that follows list length changes
//   • Optimistic-update escape hatch via `setData`
//   • Explicit `refresh()` for user-triggered re-fetches
//
// Usage:
//   const { data, loading, error, selected, selectPrev, selectNext, refresh } =
//     useResource({ fetch: fetchNpmHosts, pollInterval: 10_000 });
//
// The `fetch` option is read via a ref on every render, so inline arrow
// functions are safe — no stale closures and no interval re-creation.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import type { Dispatch, SetStateAction }             from "react";

// ── Public types ──────────────────────────────────────────────────────────────

export interface UseResourceOptions<T> {
  /** Data-fetching function.  Inline arrows are fine — tracked via ref. */
  fetch: () => Promise<T[]>;

  /**
   * Poll interval in milliseconds.
   * 0 or omitted → no background polling.
   */
  pollInterval?: number;

  /**
   * Gate the initial fetch (and polling) behind a condition.
   * When `enabled` flips from false → true the hook re-fetches.
   * Default: true.
   */
  enabled?: boolean;

  /**
   * Called after every successful fetch (initial and poll).
   * Useful for side-effects like updating sibling state.
   */
  onData?: (items: T[]) => void;

  /**
   * Called when a fetch throws.
   * When provided the internal `error` state is NOT set — the caller owns it.
   */
  onError?: (err: unknown) => void;
}

export interface UseResourceResult<T> {
  data:        T[];
  /** Optimistic-update escape hatch.  Bypasses fetch — use for local mutations. */
  setData:     Dispatch<SetStateAction<T[]>>;
  /** True only during the initial (non-silent) fetch or an explicit refresh(). */
  loading:     boolean;
  error:       string | null;

  /** Cursor index, auto-clamped to [0, data.length − 1]. */
  selected:    number;
  setSelected: (n: number | ((prev: number) => number)) => void;
  selectPrev:  () => void;
  selectNext:  () => void;

  /** Re-fetch immediately and show loading state. */
  refresh:     () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useResource<T>(
  options: UseResourceOptions<T>,
): UseResourceResult<T> {
  const {
    pollInterval = 0,
    enabled      = true,
    onData,
    onError,
  } = options;

  // Always read the latest `fetch` fn without re-creating effects.
  const fetchRef = useRef(options.fetch);
  fetchRef.current = options.fetch;

  // Same for callbacks — stable identity, always current.
  const onDataRef  = useRef(onData);
  onDataRef.current = onData;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Reflect `enabled` in a ref so the interval closure sees the latest value.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inFlightRef = useRef(false);

  // ── Core state ────────────────────────────────────────────────────────────
  const [data,    setData]    = useState<T[]>([]);
  const [loading, setLoading] = useState(true);   // true = "initial fetch pending"
  const [error,   setError]   = useState<string | null>(null);
  const [selectedRaw, setSelectedRaw] = useState(0);

  // ── Bounds-clamped selection ──────────────────────────────────────────────
  const selected: number = data.length === 0
    ? 0
    : Math.min(selectedRaw, data.length - 1);

  // Shrink cursor when the list shrinks.
  useEffect(() => {
    if (data.length > 0 && selectedRaw >= data.length) {
      setSelectedRaw(data.length - 1);
    }
  }, [data.length, selectedRaw]);

  const setSelected = useCallback((n: number | ((prev: number) => number)) => {
    setSelectedRaw((prev) => {
      const next = typeof n === "function" ? n(prev) : n;
      return Math.max(0, next);
    });
  }, []);

  const selectPrev = useCallback(() => {
    setSelectedRaw((s) => Math.max(0, s - 1));
  }, []);

  const selectNext = useCallback(() => {
    // Upper clamp applied at read-time via `selected` above.
    setSelectedRaw((s) => s + 1);
  }, []);

  // ── Internal fetch runner ─────────────────────────────────────────────────
  // silent=true  → background poll tick  (no loading flash, no error wipe)
  // silent=false → initial or explicit refresh (sets loading, clears error)
  const doFetch = useCallback(async (silent: boolean) => {
    if (!enabledRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const items = await fetchRef.current();
      setData(items);
      onDataRef.current?.(items);
    } catch (err) {
      if (onErrorRef.current) {
        onErrorRef.current(err);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      inFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);  // stable — all deps accessed via refs

  // ── Initial fetch — re-triggers when `enabled` flips true ────────────────
  useEffect(() => {
    if (!enabled) return;
    doFetch(false);
  }, [enabled, doFetch]);

  // ── Background polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pollInterval) return;
    const id = setInterval(() => doFetch(true), pollInterval);
    return () => clearInterval(id);
  }, [pollInterval, doFetch]);

  // ── Public refresh ────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    doFetch(false);
  }, [doFetch]);

  // ──────────────────────────────────────────────────────────────────────────
  return {
    data,      setData,
    loading,
    error,
    selected,  setSelected,
    selectPrev, selectNext,
    refresh,
  };
}
