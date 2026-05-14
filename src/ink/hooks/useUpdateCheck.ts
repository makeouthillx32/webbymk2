// src/ink/hooks/useUpdateCheck.ts
// ─────────────────────────────────────────────────────────────────────────────
// Background npm update check for UNAXIS.
//
// Behaviour:
//   - Runs once on mount, non-blocking (never throws, never stalls the TUI).
//   - Throttled: checks at most once every 24 h using settings.json.
//   - Returns { updateAvailable, latestVersion } — both null while pending.
//   - Works by fetching the npm registry abbreviated manifest (lightweight).
//   - Dev mode can be tested with UNAXIS_UPDATE_CHECK_VERSION=0.0.1.
//     Dev override bypasses the 24 h throttle.
//
// Version comparison is a simple semver numeric compare — no dep required.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { getSetting, setSetting } from "../../utils/secureStorage/index.js";

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

const REGISTRY_URL = "https://registry.npmjs.org/@untsystems/unaxis/latest";
const CHECK_KEY    = "last_update_check";
const INTERVAL_MS  = 24 * 60 * 60 * 1_000; // 24 hours
const FETCH_TIMEOUT_MS = 6_000;

export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion:   string | null;
}

export function useUpdateCheck(currentVersion: string): UpdateCheckResult {
  const [result, setResult] = useState<UpdateCheckResult>({
    updateAvailable: false,
    latestVersion:   null,
  });

  useEffect(() => {
    // In dev, skip unless WelcomeScreen supplied UNAXIS_UPDATE_CHECK_VERSION.
    if (!currentVersion || currentVersion === "dev") return;

    let cancelled = false;
    const devOverride = process.env.UNAXIS_UPDATE_CHECK_VERSION?.trim();
    const bypassThrottle = devOverride === currentVersion;

    async function check() {
      try {
        // Throttle: skip if checked within the last 24 hours
        if (!bypassThrottle) {
          const lastCheckStr = await getSetting(CHECK_KEY);
          if (lastCheckStr) {
            const lastCheck = new Date(lastCheckStr).getTime();
            if (!isNaN(lastCheck) && Date.now() - lastCheck < INTERVAL_MS) {
              return;
            }
          }
        }

        // Fetch latest version from npm registry
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
          // Network unavailable — silently ignore
          return;
        }

        // Record check time regardless of outcome. Dev override is repeatable.
        if (!bypassThrottle) {
          await setSetting(CHECK_KEY, new Date().toISOString());
        }

        if (cancelled || !latest) return;

        if (isNewer(currentVersion, latest)) {
          setResult({ updateAvailable: true, latestVersion: latest });
        }
      } catch {
        // Best-effort — never crash the TUI over an update check
      }
    }

    void check();
    return () => { cancelled = true; };
  }, [currentVersion]);

  return result;
}
