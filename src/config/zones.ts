// config/zones.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone type definition + static non-zone constants.
//
// Zone *data* (the actual list of zones) lives in Supabase → `public.zones`.
// Use src/ink/zone-store.ts to fetch it at runtime:
//
//   import { loadZones } from "../ink/zone-store.ts";
//   const zones = await loadZones();
//
// Keeping topology out of source control means no zone names, domains, or
// container identifiers are committed to git.
// ─────────────────────────────────────────────────────────────────────────────
import { PROJECT_DIR as _PROJECT_DIR } from "./stack.ts";

export interface Zone {
  /** Short identifier used in CLI commands and as a lookup key */
  key: string;
  /** Human-readable display name */
  label: string;
  /** Public-facing domain */
  domain: string;
  /** docker-compose service name (matches the key in docker-compose.yml) */
  service: string;
  /** Docker container name (unt_xxx) */
  container: string;
  /** Full GHCR image reference — used for docker pull */
  image: string;
  /**
   * Path to the zone's Dockerfile relative to the project root.
   * Undefined = no local build (e.g. main app pulled from GHCR directly).
   */
  dockerfile?: string;
  /** Which UPSTREAM_* env var in the proxy service points at this zone */
  upstreamEnvKey: string;
}

/** Proxy service identifiers */
export const PROXY = {
  service: "proxy",
  container: "unt_proxy",
  port: 3080,
} as const;

/**
 * Absolute path to the project root.
 * Sourced from config/stack.ts so there is one canonical definition.
 * Override with PROJECT_ROOT env var for CI / remote sessions.
 */
export const PROJECT_DIR = _PROJECT_DIR;

/** GHCR user — used to construct push tags */
export const GHCR_USER = "makeouthillx32";
