// src/ink/dev-container.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dev container lifecycle management.
//
// "Dev mode" spins up a temporary Docker container for any zone (or core) that:
//   • Volume-mounts the webbymk2 source into /app
//   • Uses a named volume for node_modules (isolates platform-native binaries
//     from the Windows host filesystem — prevents cross-platform breakage)
//   • Loads the project .env file for full environment parity
//   • Runs `bun install && bun dev` for true HMR hot-reload
//   • Registers a proxy route so the zone is immediately reachable at
//       dev.<zone-key>.<coreDomain>   (e.g. dev.shop.unenter.live)
//       dev.<coreDomain>              (e.g. dev.unenter.live  — for core)
//
// On Stop:
//   • Proxy route is removed (hot-reload in ~150ms — no proxy restart)
//   • Container is force-removed (docker rm -f)
//   • Named node_modules volume is left intact as a cache for the next start
//     (re-installing on every start would be slow; volume is cheap to prune)
//
// Naming conventions:
//   container  dev-<zone.key>             (e.g. dev-shop, dev-core)
//   volume     dev-<zone.key>-modules     (e.g. dev-shop-modules)
//   route key  dev.<zone.key>  or  "dev"  (see devRouteKey())
// ─────────────────────────────────────────────────────────────────────────────

import { spawn }     from "child_process";
import { join }      from "path";
import { existsSync } from "fs";

import type { Zone }           from "../config/zones.ts";
import { PROJECT_DIR }         from "../config/zones.ts";
import { DOMAIN }              from "../config/stack.ts";
import { STACK_HOST }           from "../config/stack.ts";
import { getStatus }           from "./docker.ts";
import { addZoneRoute, removeZoneRoute } from "./proxy-config.ts";
import { npmAddDevHost }        from "./npm-api.ts";
import { deleteZoneNpmHost }   from "./zone/npm-cleanup.ts";

// ── Docker env (mirrors docker.ts) ────────────────────────────────────────────

const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
};

// ── Naming helpers ────────────────────────────────────────────────────────────

/** Docker container name for a zone's dev container. */
export function devContainerName(zone: Zone): string {
  // Core zone (key = "unenter") gets a cleaner name.
  return zone.key === "unenter" ? "dev-core" : `dev-${zone.key}`;
}

/**
 * Proxy route key for dev routing.
 *
 * The proxy resolves:  routes.zones[key]  →  `${key}.${coreDomain}`
 *
 * Zone "shop"    →  key "dev.shop"  →  host "dev.shop.unenter.live"
 * Core "unenter" →  key "dev"       →  host "dev.unenter.live"
 */
export function devRouteKey(zone: Zone): string {
  return zone.key === "unenter" ? "dev" : `dev.${zone.key}`;
}

/** Named Docker volume that caches node_modules inside the container. */
function devModulesVolume(zone: Zone): string {
  return zone.key === "unenter" ? "dev-core-modules" : `dev-${zone.key}-modules`;
}

/**
 * Full public domain for the dev container.
 *   Core  (key="unenter")  →  "dev.unenter.live"
 *   Zone  (e.g. "shop")    →  "dev.shop.unenter.live"
 *
 * Uses DOMAIN from config/stack.ts (same source as the rest of the stack).
 * Fallback to zone.domain prefix avoids breaking if DOMAIN is not yet set.
 */
function devDomain(zone: Zone): string {
  const root = DOMAIN || "unenter.live";
  return zone.key === "unenter" ? `dev.${root}` : `dev.${zone.domain}`;
}

// ── Status ────────────────────────────────────────────────────────────────────

/** True when a dev container for this zone is currently running (or starting). */
export async function isDevRunning(zone: Zone): Promise<boolean> {
  const s = await getStatus(devContainerName(zone));
  return s === "running" || s === "starting";
}

// ── Internal Docker helpers ───────────────────────────────────────────────────

/** Fire-and-forget `docker rm -f <container>` — resolves when done. */
function dockerRmForce(container: string, onLine: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["rm", "-f", container], {
      env:   DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    proc.stdout?.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      // Suppress "No such container" — that's the happy path on stop.
      const msg = d.toString().trim();
      if (msg && !msg.toLowerCase().includes("no such container")) onLine(msg);
    });
    proc.on("close", (code) => resolve(code ?? 0));
    proc.on("error", (e) => { onLine(`docker rm error: ${e.message}`); resolve(1); });
  });
}

/** Resolve the project directory as a Docker-compatible mount source.
 *
 *  On Windows with Docker Desktop, Docker accepts both Windows paths
 *  (C:\foo\bar) and forward-slash paths (/c/foo/bar).  We pass the raw
 *  PROJECT_DIR — Docker Desktop's CLI handles translation automatically.
 */
function mountSource(): string {
  return PROJECT_DIR;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start a dev container for the given zone.
 *
 *   1. Remove any stale container with the same name (idempotent)
 *   2. `docker run -d` with source volume + isolated node_modules volume
 *   3. Register proxy route  dev.<zone.key>.<coreDomain>  →  container:3000
 *
 * The container runs:  sh -c "bun install && bun dev"
 * so node_modules are always up-to-date on first start after a dependency change.
 */
export async function startDevContainer(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const container = devContainerName(zone);
  const volume    = devModulesVolume(zone);
  const routeKey  = devRouteKey(zone);
  const upstream  = `http://${container}:3000`;
  const envFile   = join(PROJECT_DIR, ".env");

  onLine(`Starting dev container for ${zone.label}…`);
  onLine(`  container : ${container}`);
  onLine(`  route     : ${devDomain(zone)}  →  ${upstream}  (internal)`);

  // Remove stale container if it somehow exists
  await dockerRmForce(container, onLine);

  const args = [
    "run", "-d",
    "--name",    container,
    "--network", "unenter",
    // Source mount — live code available inside the container
    "-v", `${mountSource()}:/app`,
    // Isolated node_modules — Linux binaries, not Windows host's copies
    "-v", `${volume}:/app/node_modules`,
    // Full environment parity with production
    ...(existsSync(envFile) ? ["--env-file", envFile] : []),
    // Zone identity override
    "-e", `NEXT_PUBLIC_ZONE=${zone.key}`,
    // Windows bind mounts do not always deliver filesystem events into Linux
    // containers. Polling keeps Next dev/HMR honest for host-side edits.
    "-e", "WATCHPACK_POLLING=true",
    "-e", "CHOKIDAR_USEPOLLING=true",
    "-e", "NEXT_WEBPACK_USEPOLLING=1",
    // Working directory
    "-w", "/app",
    // Image — lightweight official Bun runtime
    "oven/bun:1",
    // Install (updates node_modules volume if deps changed), then start dev server
    "sh", "-c", "rm -rf .next && bun install && bun dev",
  ];

  return new Promise((resolve) => {
    const proc = spawn("docker", args, {
      env:   DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });
    proc.stderr?.on("data", (d: Buffer) => {
      d.toString().split("\n").filter(Boolean).forEach(onLine);
    });

    proc.on("close", async (code) => {
      const exit = code ?? 1;
      if (exit === 0) {
        onLine(`✓ Container started — registering proxy route…`);
        await addZoneRoute(routeKey, upstream, onLine);

        // Register an HTTP-only NPM entry so the dev domain is accessible
        // externally without Let's Encrypt (which rate-limits on frequent
        // container start/stop).  This step is non-fatal — the internal proxy
        // route is already active regardless.
        onLine(`Registering NPM proxy host…`);
        const devHostname = devDomain(zone);
        // Forward to STACK_HOST (the proxy container) — same value all zones use.
        // NPM and the app stack share the same Docker network so the proxy
        // container name resolves correctly.  Never use the container name of
        // dev-core directly — requests must go through the proxy so routing
        // rules (routes.json) are applied.
        await npmAddDevHost(devHostname, STACK_HOST.ip, STACK_HOST.proxyPort, onLine);

        onLine(`✓ Dev server live — bun dev starting inside container`);
        onLine(`  Logs: [l]ogs on the container  (or docker logs -f ${container})`);
      } else {
        onLine(`✗ docker run failed (exit ${exit}) — check Docker is running and image "oven/bun:1" is accessible`);
      }
      resolve(exit);
    });

    proc.on("error", (e) => {
      onLine(`✗ docker run error: ${e.message}`);
      resolve(1);
    });
  });
}

/**
 * Stop and fully remove a zone's dev container.
 *
 *   1. Remove proxy route (hot-reload, ~150ms — no proxy restart)
 *   2. `docker rm -f <container>`
 *
 * The node_modules volume is intentionally kept as a cache.  Run
 * `docker volume rm <dev-zone-modules>` manually to reclaim disk space.
 */
export async function stopDevContainer(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const container = devContainerName(zone);
  const routeKey  = devRouteKey(zone);

  onLine(`Stopping dev container for ${zone.label}…`);

  // Remove proxy route — dev domain stops routing immediately (~150ms)
  await removeZoneRoute(routeKey, onLine);

  // Remove NPM proxy host
  await deleteZoneNpmHost(routeKey, onLine);

  const code = await dockerRmForce(container, onLine);
  if (code === 0) {
    onLine(`✓ Dev container removed (${container})`);
    onLine(`  Note: node_modules volume "${devModulesVolume(zone)}" kept as install cache.`);
    onLine(`        Run: docker volume rm ${devModulesVolume(zone)}  to reclaim disk space.`);
  }
  return code;
}

/**
 * Toggle dev mode: start if stopped, stop if running.
 *
 * Convenience wrapper used by the TUI action executor so it doesn't need
 * to track dev container state separately.
 */
export async function toggleDevContainer(
  zone:   Zone,
  onLine: (l: string) => void,
): Promise<number> {
  const running = await isDevRunning(zone);
  if (running) {
    return stopDevContainer(zone, onLine);
  }
  return startDevContainer(zone, onLine);
}
