// tui/docker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Low-level Docker + Compose wrappers.
// Uses Node's child_process so the bundled dist/cli.js runs under plain Node.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn }       from "child_process";
import type { ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join }         from "path";
import { PROJECT_DIR, PROXY, type Zone } from "../config/zones.ts";
import { drainStream } from "./utils.ts";

export type Status =
  | "running"    // up and healthy (or no healthcheck configured)
  | "starting"   // container running, healthcheck in start_period / retrying
  | "unhealthy"  // container running but healthcheck is failing
  | "stopped"    // container exists but not running
  | "missing";   // container doesn't exist

// On Linux/Mac (or inside a container) we need to point at the Docker socket
// explicitly. On Windows, Docker Desktop's CLI handles routing automatically.
const DOCKER_ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  ...(process.platform !== "win32"
    ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
    : {}),
};

// ── Primitives ────────────────────────────────────────────────────────────────

/** Spawn a docker command and collect full stdout/stderr. */
async function dockerRun(
  args: string[]
): Promise<{ out: string; err: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, {
      env:   DOCKER_ENV,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("close",  (code) => resolve({ out: out.trim(), err: err.trim(), code: code ?? 1 }));
    proc.on("error",  reject);
  });
}

/** Run `docker compose <args>` from the project root, streaming lines. */
export async function composeRun(
  args: string[],
  onLine?: (line: string) => void
): Promise<number> {
  const cb   = onLine ?? (() => {});
  const proc = spawn("docker", ["compose", ...args], {
    cwd:   PROJECT_DIR,
    env:   DOCKER_ENV,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let code = 1;
  const exited = new Promise<void>((resolve, reject) => {
    proc.on("close", (c) => { code = c ?? 1; resolve(); });
    proc.on("error", reject);
  });

  // Docker/compose writes user-facing progress to stderr when piped (no TTY).
  // stdout is either empty or machine-readable JSON — draining both causes
  // every line to appear twice in the overlay.
  await Promise.all([
    drainStream(proc.stderr, cb),
    exited,
  ]);
  return code;
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getStatus(container: string): Promise<Status> {
  // Read both container state and healthcheck status in one call.
  // .State.Health.Status is empty string when no healthcheck is configured.
  const { out, code } = await dockerRun([
    "inspect",
    "--format", "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
    container,
  ]);
  if (code !== 0) return "missing";

  const [state, health] = out.split("|");

  if (state !== "running") return "stopped";

  // If a healthcheck exists, surface its state
  if (health === "unhealthy") return "unhealthy";
  if (health === "starting")  return "starting";

  // "healthy" or no healthcheck configured → running
  return "running";
}

/** Poll all zones + proxy in parallel and return a status map. */
export async function pollAll(
  zones: Zone[]
): Promise<{ zoneStatuses: Record<string, Status>; proxyStatus: Status }> {
  const [proxyStatus, ...zoneResults] = await Promise.all([
    getStatus(PROXY.container),
    ...zones.map((z) => getStatus(z.container)),
  ]);
  const zoneStatuses: Record<string, Status> = {};
  zones.forEach((z, i) => { zoneStatuses[z.key] = zoneResults[i]; });
  return { zoneStatuses, proxyStatus };
}

// ── Zone operations ───────────────────────────────────────────────────────────

/** `docker compose restart <service>` */
export async function restartZone(
  zone: Zone,
  onLine?: (l: string) => void
): Promise<number> {
  return composeRun(["restart", zone.service], onLine);
}

/**
 * Self-healing compose check — ensures the service block in docker-compose.yml
 * has an `image:` field pointing at zone.image.  Without this line:
 *   - `docker compose pull <svc>` is a no-op ("Skipped No image to be pulled")
 *   - `docker compose up` falls back to `{project}-{service}:latest` which
 *     doesn't match what our TUI build produces → "No such image" error
 *
 * Safe to run on every deploy — it's idempotent (no-op when the line already
 * exists or when the service block isn't found).  Returns true if it made
 * changes so the caller can log it.
 */
export function doctorComposeService(
  zone: Zone,
  onLine?: (l: string) => void
): boolean {
  const composePath = join(PROJECT_DIR, "docker-compose.yml");
  if (!existsSync(composePath)) return false;

  const content = readFileSync(composePath, "utf-8");
  const lines   = content.split("\n");

  // Find the service block: `  <service>:` at 2-space indent (top-level service).
  const serviceHeader = `  ${zone.service}:`;
  const startIdx = lines.findIndex((l) => l === serviceHeader);
  if (startIdx === -1) return false;

  // Scan inside the block (lines indented more than 2 spaces) for an `image:` key.
  // Stop when we hit another service header (line at 2-space indent that isn't blank/comment).
  let hasImage = false;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // End of block: next top-level key at 2-space indent
    if (/^  \S/.test(line) && !line.startsWith("    ")) break;
    // Match `    image: ...` inside the block (4+ spaces indent)
    if (/^\s{4}image:\s*/.test(line)) {
      hasImage = true;
      break;
    }
  }

  if (hasImage) return false;

  // Insert `    image: ${zone.image}` as the first child line of the service block
  const patched = [
    ...lines.slice(0, startIdx + 1),
    `    image: ${zone.image}`,
    ...lines.slice(startIdx + 1),
  ].join("\n");

  writeFileSync(composePath, patched, "utf-8");
  onLine?.(`⚙ auto-fix: added 'image: ${zone.image}' to compose service '${zone.service}'`);
  return true;
}

/** `docker compose pull <service> && docker compose up -d --force-recreate <service>`
 *
 * Auto-heals missing `image:` fields in docker-compose.yml before running
 * (eliminates "No such image: webbymk2-<svc>:latest" from incomplete scaffolds).
 * Uses --force-recreate so the running container is ALWAYS swapped for the
 * newly-pulled image — prevents "stale container" confusion where a deploy
 * appears to succeed but the previous container is still running.
 */
export async function pullAndUp(
  zone: Zone,
  onLine?: (l: string) => void
): Promise<number> {
  // Self-heal: ensure the compose service has an image: field before deploying.
  doctorComposeService(zone, onLine);

  onLine?.(`Pulling ${zone.image}...`);
  const pullCode = await composeRun(["pull", zone.service], onLine);
  if (pullCode !== 0) return pullCode;
  onLine?.(`Starting ${zone.service} (force-recreate)...`);
  return composeRun(["up", "-d", "--no-build", "--force-recreate", zone.service], onLine);
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

/** Recreate the proxy container so it picks up new UPSTREAM_* env vars.
 *
 * CRITICAL: `docker compose restart` is NOT enough — it stops and starts the
 * existing container, preserving its environment variables.  When a new zone
 * is scaffolded, the TUI writes `UPSTREAM_<KEY>: "http://<svc>:3000"` into the
 * proxy's `environment:` block in docker-compose.yml.  A plain `restart` will
 * never inject that new var, so requests for <key>.unenter.live fall through
 * to the default upstream (core's app) and serve the WRONG content.
 *
 * Using `up -d --no-build --force-recreate` rereads docker-compose.yml and
 * rebuilds the container with the current env, which is what we actually want.
 * This was the exact cause of "new zones show core's landing page instead of
 * the zone template" on first scaffold.
 */
export async function reloadProxy(onLine?: (l: string) => void): Promise<number> {
  onLine?.("Recreating proxy (unt_proxy) to pick up new UPSTREAM_* env...");
  return composeRun(
    ["up", "-d", "--no-build", "--force-recreate", PROXY.service],
    onLine,
  );
}

// ── Log tailing ───────────────────────────────────────────────────────────────

/** Spawn `docker logs --follow` for a container. Caller owns the process. */
export function spawnLogTail(
  container: string,
  tail = 60
): ChildProcess {
  return spawn(
    "docker",
    ["logs", "--follow", "--tail", String(tail), container],
    { env: DOCKER_ENV, stdio: ["ignore", "pipe", "pipe"] }
  );
}
