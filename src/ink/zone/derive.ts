// src/ink/zone/derive.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone value computation.
//
//   deriveZone()      — compute all DerivedZone fields from a NewZoneParams
//   findNextDevPort() — scan existing zones for next free dev port
// ─────────────────────────────────────────────────────────────────────────────

import { join }                   from "path";
import { existsSync, readFileSync } from "fs";
import { readdir }                from "fs/promises";
import { PROJECT_DIR, DOMAIN }   from "../../config/stack.ts";
import type { NewZoneParams, DerivedZone } from "./types.ts";

// ── Derive all zone values from key + label ───────────────────────────────────

export function deriveZone(params: NewZoneParams, devPort: number): DerivedZone {
  const { key, label, layoutType, appFooter, dynamicSections } = params;
  const rootDomain = DOMAIN || "unenter.live";
  return {
    key,
    label,
    layoutType,
    // appFooter is only meaningful for "app" layout — force "none" for others
    // so routeClassifier.ts overrides are never accidentally polluted.
    appFooter:       layoutType === "app" ? (appFooter ?? "none") : "none",
    domain:          `${key}.${rootDomain}`,
    service:         key,
    container:       `unt_${key}`,
    image:           `ghcr.io/makeouthillx32/unenter-${key}:latest`,
    dockerfile:      `zones/${key}/Dockerfile`,
    // NOTE: upstreamEnvKey is kept for DB compatibility but unused at runtime.
    // Proxy reads zones from the DB directly (not from UPSTREAM_* env vars).
    upstreamEnvKey:  `UPSTREAM_${key.toUpperCase()}`,
    devPort,
    dynamicSections: dynamicSections ?? [],
  };
}

// ── Find next available dev port ──────────────────────────────────────────────
// Scans all zones/{*}/package.json for "next dev -p XXXX" and picks next free.

export async function findNextDevPort(): Promise<number> {
  const zonesDir  = join(PROJECT_DIR, "zones");
  const usedPorts = new Set<number>();

  try {
    const entries = await readdir(zonesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(zonesDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;
      try {
        const pkg       = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const devScript = (pkg?.scripts?.dev ?? "") as string;
        const match     = devScript.match(/-p\s+(\d+)/);
        if (match) usedPorts.add(Number(match[1]));
      } catch {
        // ignore malformed package.json
      }
    }
  } catch {
    // zones/ doesn't exist yet — that's fine
  }

  let port = 3001;
  while (usedPorts.has(port)) port++;
  return port;
}
