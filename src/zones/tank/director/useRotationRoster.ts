"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_ROTATION_ROSTER,
  ROTATION_MAX_INTERVAL_MS,
  ROTATION_MIN_INTERVAL_MS,
  type RotationRoster,
} from "../server/rotationRoster";

/**
 * The rotation roster, owned by the server.
 *
 * The configurator used to hold this in plain React state, which meant setting
 * a roster and refreshing lost it — and the 24/7 director, which is the thing
 * that actually cuts, never saw it at all. This hook makes the panel a client
 * of server state instead of the owner of it: it reads the durable roster,
 * writes changes back, and re-reads so a second operator's edit shows up here.
 *
 * Writes are OPTIMISTIC with a revert. A camera toggle has to feel instant, but
 * a save that failed must not leave the panel showing a roster the director is
 * not using — that is precisely the class of lie this hook exists to remove.
 */
export function useRotationRoster(pollMs = 15_000, initialRoster?: RotationRoster | null) {
  const [roster, setRoster] = useState<RotationRoster>(initialRoster || EMPTY_ROTATION_ROSTER);
  const [attached, setAttached] = useState(Boolean(initialRoster));
  const [error, setError] = useState<string | null>(null);

  // What the operator most recently intended. Compared against on every
  // refresh so a poll landing mid-edit cannot stomp a change still in flight.
  const intendedRef = useRef<RotationRoster>(initialRoster || EMPTY_ROTATION_ROSTER);
  const inFlightRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/tank/director/rotation", { cache: "no-store" });
      const payload = await response.json();
      if (!payload?.roster) throw new Error("no roster");
      // A refresh must never overwrite an edit that has not been saved yet.
      if (inFlightRef.current > 0) return;
      setRoster(payload.roster as RotationRoster);
      intendedRef.current = payload.roster as RotationRoster;
      setAttached(Boolean(payload.success));
      setError(payload.success ? null : "Rotation roster is read-only right now");
    } catch {
      setAttached(false);
      setError("Not attached to the Server Director's roster");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(timer);
  }, [refresh, pollMs]);

  const commit = useCallback(async (next: RotationRoster) => {
    const previous = intendedRef.current;
    intendedRef.current = next;
    inFlightRef.current += 1;
    try {
      const response = await fetch("/api/tank/director/rotation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("rejected");
      const payload = await response.json();
      // The server sanitises (clamps the interval, drops duplicates), so its
      // answer is the truth — not what was typed.
      if (payload?.roster) {
        intendedRef.current = payload.roster as RotationRoster;
        setRoster(payload.roster as RotationRoster);
      }
      setAttached(true);
      setError(null);
    } catch {
      // Revert, loudly. A panel that keeps showing an unsaved roster is how an
      // operator ends up believing the director is cycling cameras it is not.
      intendedRef.current = previous;
      setRoster(previous);
      setError("Roster change was not saved to the Server Director");
    } finally {
      inFlightRef.current -= 1;
    }
  }, []);

  /** Add or remove a camera. Saves immediately — a click is a deliberate act. */
  const toggleCamera = useCallback(
    (cameraId: string) => {
      const current = intendedRef.current;
      const already = current.cameraIds.includes(cameraId);
      const next: RotationRoster = {
        ...current,
        cameraIds: already
          ? current.cameraIds.filter((id) => id !== cameraId)
          : [...current.cameraIds, cameraId],
      };
      setRoster(next);
      intendedRef.current = next;
      void commit(next);
    },
    [commit],
  );

  /**
   * Set the dwell.
   *
   * DEBOUNCED, unlike the toggle: this is a number input, so it fires on every
   * keystroke — typing "170" would otherwise POST 1, then 17, then 170, and the
   * first two would be clamped to the minimum and briefly become the real dwell
   * on a live broadcast.
   */
  const setIntervalSeconds = useCallback(
    (seconds: number) => {
      const ms = Math.min(
        ROTATION_MAX_INTERVAL_MS,
        Math.max(ROTATION_MIN_INTERVAL_MS, Math.round((Number(seconds) || 0) * 1000)),
      );
      const next: RotationRoster = { ...intendedRef.current, intervalMs: ms };
      setRoster(next);
      intendedRef.current = next;

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => void commit(intendedRef.current), 600);
    },
    [commit],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  return { roster, attached, error, toggleCamera, setIntervalSeconds, refresh };
}
