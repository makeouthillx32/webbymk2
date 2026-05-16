// src/ink/hooks/useUpdateCheck.ts
// ─────────────────────────────────────────────────────────────────────────────
// Background npm update check for UNAXIS.
//
// Behaviour:
//   - Runs once on mount, then rechecks every 30 minutes.
//   - Non-blocking — never throws, never stalls the TUI.
//   - Throttled: skips the network fetch if checked within 24 h (persisted in
//     settings.json) unless the dev override is set.
//   - isCheckingRef guard: if a check is already in flight, the next interval
//     tick is a no-op — avoids parallel fetches on slow networks.
//   - Returns { updateAvailable, latestVersion, isChecking } so callers can
//     show a subtle "checking…" indicator while the request is in-flight.
//   - Works by fetching the npm registry abbreviated manifest (lightweight).
//   - Dev mode: UNAXIS_UPDATE_CHECK_VERSION=0.0.1 bypasses the 24 h throttle.
//
// Version comparison is a simple semver numeric compare — no dep required.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { getSetting, setSetting } from "../../utils/secureStorage/index.js";
import { isScrollActive }         from "../../bootstrap/state.js";

// ── Version helpers ───────────────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const parts = v
    .replace(/^v/, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10));
  const partOrZero = (part: number | undefined) =>
    typeof part === "number" && Number.isFinite(part) ? part : 0;
  return [
    partOrZero(parts[0]),
    partOrZero(parts[1]),
    partOrZero(parts[2]),
  ];
}

/** Returns true if `candidate` is strictly newer than `current`. */
function isNewer(current: string, candidate: string): boolean {
  const [cMaj, cMin, cPat] = parseSemver(current);
  const [nMaj, nMin, nPat] = parseSemver(candidate);
  if (nMaj !== cMaj) return nMaj > cMaj;
  if (nMin !== cMin) return nMin > cMin;
  return nPat > cPat;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const REGISTRY_URL  = "https://registry.npmjs.org/@untsystems/unaxis/latest";
const CHECK_KEY     = "last_update_check";
const PERSIST_MS    = 24 * 60 * 60 * 1_000; // 24 h — throttle for network fetches
const POLL_INTERVAL = 30 * 60 * 1_000;      // 30 min — recheck interval
const FETCH_TIMEOUT = 6_000;

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion:   string | null;
  /** True while the network request is in-flight. */
  isChecking:      boolean;
}

export function useUpdateCheck(currentVersion: string): UpdateCheckResult {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion,   setLatestVersion]   = useState<string | null>(null);
  const [isChecking,      setIsChecking]       = useState(false);

  // Ref-based guard: prevents two in-flight checks from running simultaneously.
  // Using a ref (not state) keeps the check() callback identity stable so the
  // 30-min interval doesn't need to be torn down and re-created on each render.
  const isCheckingRef = useRef(false);
  const cancelledRef  = useRef(false);

  const devOverride    = process.env.UNAXIS_UPDATE_CHECK_VERSION?.trim();
  const bypassThrottle = !!(devOverride && devOverride === currentVersion);

  const check = useCallback(async () => {
    // Skip: dev/unknown version, another check already in flight, or scrolling
    if (!currentVersion || currentVersion === "dev") return;
    if (isCheckingRef.current) return;
    if (isScrollActive())      return;

    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      // Throttle: skip the network hit if already checked in the last 24 h
      if (!bypassThrottle) {
        const lastCheckStr = await getSetting(CHECK_KEY);
        if (lastCheckStr) {
          const lastCheck = new Date(lastCheckStr).getTime();
          if (!isNaN(lastCheck) && Date.now() - lastCheck < PERSIST_MS) return;
        }
      }

      // Fetch latest version from npm registry (lightweight endpoint)
      const controller = new AbortController();
      const timer      = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      let latest: string | null = null;
      try {
        const res = await fetch(REGISTRY_URL, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json() as { version?: string };
          latest = typeof json.version === "string" ? json.version : null;
        }
      } catch {
        clearTimeout(timer);
        return; // Network unavailable — silently ignore
      }

      // Record check time (even if registry returned no version)
      if (!bypassThrottle) {
        await setSetting(CHECK_KEY, new Date().toISOString());
      }

      if (cancelledRef.current || !latest) return;

      if (isNewer(currentVersion, latest)) {
        setUpdateAvailable(true);
        setLatestVersion(latest);
      }
    } catch {
      // Best-effort — never crash the TUI over an update check
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, [currentVersion, bypassThrottle]);

  // Initial check on mount
  useEffect(() => {
    cancelledRef.current = false;
    void check();
    return () => { cancelledRef.current = true; };
  }, [check]);

  // Recheck every 30 minutes (suppressed during scroll like other polling)
  useEffect(() => {
    if (!currentVersion || currentVersion === "dev") return;
    const id = setInterval(() => { void check(); }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [check, currentVersion]);

  return { updateAvailable, latestVersion, isChecking };
}
