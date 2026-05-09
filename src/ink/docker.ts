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

// ── Zone-compose helpers ──────────────────────────────────────────────────────

/** Absolute path to a zone's own compose file (zones/<key>/docker-compose.yml). */
export function zoneComposePath(key: string): string {
  return join(PROJECT_DIR, "zones", key, "docker-compose.yml");
}

/** True when the zone has its own per-zone compose file (new-style zone). */
export function zoneComposeExists(key: string): boolean {
  return existsSync(zoneComposePath(key));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run `docker compose <args>` from the project root, streaming lines.
 *
 * Pass `composeFile` to target a specific compose file instead of the
 * default docker-compose.yml (e.g. a per-zone file).
 */
export async function composeRun(
  args: string[],
  onLine?: (line: string) => void,
  composeFile?: string,
): Promise<number> {
  const cb       = onLine ?? (() => {});
  const fileFlag = composeFile ? ["-f", composeFile] : [];
  const proc = spawn("docker", ["compose", ...fileFlag, ...args], {
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
  return (await getStatuses([container]))[container] ?? "missing";
}

function statusFromInspect(state: string | undefined, health: string | undefined): Status {
  if (state !== "running") return "stopped";

  // If a healthcheck exists, surface its state
  if (health === "unhealthy") return "unhealthy";
  if (health === "starting")  return "starting";

  // "healthy" or no healthcheck configured → running
  return "running";
}

export async function getStatuses(
  containers: readonly string[],
): Promise<Record<string, Status>> {
  const statuses: Record<string, Status> = {};
  for (const container of containers) statuses[container] = "missing";
  if (containers.length === 0) return statuses;

  try {
    const { out } = await dockerRun([
      "inspect",
      "--format", "{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
      ...containers,
    ]);

    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      const [rawName, state, health] = line.split("|");
      const name = rawName?.replace(/^\//, "");
      if (!name || !(name in statuses)) continue;
      statuses[name] = statusFromInspect(state, health);
    }
  } catch {
    // Docker unavailable: leave all requested containers as "missing".
  }

  return statuses;
}

/** Poll all zones + proxy in parallel and return a status map. */
export async function pollAll(
  zones: Zone[]
): Promise<{ zoneStatuses: Record<string, Status>; proxyStatus: Status }> {
  const statuses = await getStatuses([PROXY.container, ...zones.map((z) => z.container)]);
  const zoneStatuses: Record<string, Status> = {};
  zones.forEach((z) => { zoneStatuses[z.key] = statuses[z.container] ?? "missing"; });
  return { zoneStatuses, proxyStatus: statuses[PROXY.container] ?? "missing" };
}

// ── Network pre-flight ────────────────────────────────────────────────────────

/**
 * Ensure the shared Docker network "unenter" exists before attempting to
 * start any zone container that declares it as external.
 *
 * The network is created by `docker compose up` on the root docker-compose.yml
 * (which now carries `name: unenter`).  Two failure modes are handled:
 *
 *   A) Network never created (core stack not yet started).
 *   B) Network exists but under the legacy project-prefixed name
 *      (e.g. `webbymk2_unenter`) because core was started before the
 *      `name: unenter` field was added to the root compose.
 *
 * For case B this function self-heals by running `docker compose up -d` on
 * the root compose so Docker recreates the network with the correct name and
 * reconnects all core containers.  The zone deploy can then proceed.
 *
 * Returns true when the network is ready; false (after logging) on failure.
 */
export async function ensureZoneNetwork(
  onLine: (l: string) => void,
): Promise<boolean> {
  // Check for exact network name "unenter"
  const { out, code } = await dockerRun([
    "network", "ls",
    "--filter", "name=^unenter$",
    "--format", "{{.Name}}",
  ]);
  if (code === 0 && out.trim() === "unenter") return true;

  // Not found — check for the legacy project-prefixed variant
  const { out: listOut } = await dockerRun(["network", "ls", "--format", "{{.Name}}"]);
  const prefixed = listOut.split("\n").map((n) => n.trim()).find((n) => n.endsWith("_unenter"));

  if (prefixed) {
    onLine(`⚠ Docker network 'unenter' not found — found '${prefixed}' (old project-prefix name).`);
    onLine(`  Recreating network with correct name via: docker compose up -d …`);
    const fixCode = await composeRun(["up", "-d", "--remove-orphans"], onLine);
    if (fixCode !== 0) {
      onLine(`✗ Failed to recreate core network. Start the core stack manually:`);
      onLine(`    docker compose up -d`);
      return false;
    }
    // Verify the fix worked
    const { out: verify } = await dockerRun([
      "network", "ls", "--filter", "name=^unenter$", "--format", "{{.Name}}",
    ]);
    if (verify.trim() === "unenter") {
      onLine(`✓ Network 'unenter' is now ready`);
      return true;
    }
    onLine(`✗ Network still not found after core restart — check docker compose logs`);
    return false;
  }

  // No network at all
  onLine(`✗ Docker network 'unenter' not found and no core stack detected.`);
  onLine(`  Start the core stack first:  docker compose up -d`);
  return false;
}

// ── Zone operations ───────────────────────────────────────────────────────────

/** `docker compose restart <service>` — uses per-zone compose file if present. */
export async function restartZone(
  zone: Zone,
  onLine?: (l: string) => void
): Promise<number> {
  const file = zoneComposeExists(zone.key) ? zoneComposePath(zone.key) : undefined;
  return composeRun(["restart", zone.service], onLine, file);
}

/**
 * @deprecated New zones use per-zone compose files (zones/<key>/docker-compose.yml)
 * which always contain a correct `image:` field — no patching needed.
 * This function is retained only for legacy zones whose service block still
 * lives in the root docker-compose.yml.  It is a no-op for new-style zones.
 *
 * Self-healing compose check — ensures the service block in docker-compose.yml
 * has an `image:` field pointing at zone.image.
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

/**
 * `docker compose pull <service> && docker compose up -d --force-recreate <service>`
 *
 * For new-style zones (with their own zones/<key>/docker-compose.yml) the
 * per-zone file is used directly — no doctorComposeService needed because the
 * generated file always contains a correct `image:` field.
 *
 * For legacy zones (service block still in root docker-compose.yml) falls back
 * to the root file and auto-heals a missing `image:` field first.
 *
 * Uses --force-recreate so the running container is ALWAYS swapped for the
 * newly-pulled image — prevents "stale container" confusion.
 */
export async function pullAndUp(
  zone: Zone,
  onLine?: (l: string) => void
): Promise<number> {
  const newStyle = zoneComposeExists(zone.key);
  const file     = newStyle ? zoneComposePath(zone.key) : undefined;

  // Legacy zones only: self-heal missing `image:` field in root compose.
  if (!newStyle) doctorComposeService(zone, onLine);

  onLine?.(`Pulling ${zone.image}...`);
  const pullCode = await composeRun(["pull", zone.service], onLine, file);
  if (pullCode !== 0) return pullCode;
  onLine?.(`Starting ${zone.service} (force-recreate)...`);
  return composeRun(["up", "-d", "--no-build", "--force-recreate", zone.service], onLine, file);
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
 * Using `up -d --build --force-recreate` rebuilds the proxy image from
 * proxy/server.js, then recreates the container with the current env.
 *
 * NOTE: --build (not --no-build) is intentional here.  The proxy is a local
 * build (proxy/Dockerfile copies server.js) — NOT a GHCR-pulled image.
 * --no-build would lock in a stale image every time, so any changes to
 * proxy/server.js would never take effect until someone manually rebuilt.
 * Docker's layer cache makes the rebuild nearly instant when server.js is
 * unchanged, so --build is safe to use unconditionally.
 */
export async function reloadProxy(onLine?: (l: string) => void): Promise<number> {
  onLine?.("Building + recreating proxy (unt_proxy)...");
  return composeRun(
    ["up", "-d", "--build", "--force-recreate", PROXY.service],
    onLine,
  );
}

// ── Zone teardown ─────────────────────────────────────────────────────────────

/**
 * Stop + remove a zone's container and delete its local image.
 *
 * For new-style zones: targets zones/<key>/docker-compose.yml so teardown
 * works even after the service block is no longer in the root compose.
 * For legacy zones: falls back to root docker-compose.yml (which must still
 * contain the service definition at the time this is called).
 *
 * Failures are non-fatal: a container that is already stopped/missing is the
 * same end-state as one we just stopped — log and continue either way.
 */
export async function removeZoneDockerArtifacts(
  service:   string,  // docker compose service name  (= zone key)
  container: string,  // container_name value          (= unt_{key})
  image:     string,  // full image tag                (= ghcr.io/…/unenter-{key}:latest)
  onLine:    (l: string) => void,
): Promise<void> {
  const file = zoneComposeExists(service) ? zoneComposePath(service) : undefined;

  // 1 — Stop + remove container via compose rm (graceful, respects depends_on)
  onLine(`Stopping container  ${container}…`);
  const rmCode = await composeRun(["rm", "-s", "-v", "-f", service], onLine, file);
  if (rmCode === 0) {
    onLine(`✓ Container stopped and removed  (${container})`);
  } else {
    // compose rm fails if the service was never started or already gone.
    // Fall back to a direct docker rm so we're sure.
    const { code: directCode } = await dockerRun(["rm", "-f", container]);
    if (directCode === 0) {
      onLine(`✓ Container removed  (docker rm -f ${container})`);
    } else {
      onLine(`  No running container to remove  (${container})`);
    }
  }

  // 2 — Remove the local image to free disk space
  onLine(`Removing image  ${image}…`);
  const { code: rmiCode, err: rmiErr } = await dockerRun(["rmi", "-f", image]);
  if (rmiCode === 0) {
    onLine(`✓ Image removed  (${image})`);
  } else if (rmiErr.toLowerCase().includes("no such image") || rmiErr.toLowerCase().includes("not found")) {
    onLine(`  Image not present locally — nothing to remove`);
  } else {
    onLine(`⚠ docker rmi exited ${rmiCode} — ${rmiErr || "image may already be gone"}`);
  }
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
