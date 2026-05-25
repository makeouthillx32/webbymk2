// tui/docker.ts
// ─────────────────────────────────────────────────────────────────────────────
// Low-level Docker + Compose wrappers.
// Uses Node's child_process so the bundled dist/cli.js runs under plain Node.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn }       from "child_process";
import type { ChildProcess } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join }         from "path";
import { PROJECT_DIR, PROXY, GHCR_USER, type Zone } from "../config/zones.ts";
import { ARTIFACT_STORE_DIR }                        from "../config/stack.ts";
import { getCredential } from "../utils/secureStorage/index.js";

export type Status =
  | "running"    // up and healthy (or no healthcheck configured)
  | "starting"   // container running, healthcheck in start_period / retrying
  | "unhealthy"  // container running but healthcheck is failing
  | "stopped"    // container exists but not running
  | "missing";   // container doesn't exist

// ── Docker environment helpers ─────────────────────────────────────────────────
//
// makeDockerEnv(dockerUrl?)
//   Build the process env for any `docker` / `docker compose` subprocess.
//
//   - No argument  →  local socket (same behaviour as before)
//   - With a URL   →  overrides DOCKER_HOST so the command targets that host.
//                     Use this to drive a remote environment (remote-docker type).
//
// On Linux/Mac (or inside a container) we need to point at the local Docker
// socket explicitly.  On Windows, Docker Desktop handles routing automatically.

function makeDockerEnv(dockerUrl?: string): Record<string, string> {
  const localSocket =
    process.platform !== "win32"
      ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
      : {};
  return {
    ...(process.env as Record<string, string>),
    ...localSocket,
    ...(dockerUrl ? { DOCKER_HOST: dockerUrl } : {}),
  };
}

// ── Primitives ────────────────────────────────────────────────────────────────

/** Spawn a docker command and collect full stdout/stderr. */
async function dockerRun(
  args: string[]
): Promise<{ out: string; err: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, {
      env:   makeDockerEnv(),
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

export interface InternetConnectivityResult {
  online: boolean;
  method?: "curl" | "nslookup" | "ping" | "docker-pull";
  detail?: string;
  checkedAt: number;
}

let internetConnectivityCache: InternetConnectivityResult | null = null;
const INTERNET_CONNECTIVITY_CACHE_MS = 30_000;

function runConnectivityCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      env: makeDockerEnv(),
      stdio: ["ignore", "ignore", "ignore"],
    });

    let settled = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    timer = setTimeout(() => {
      proc.kill();
      finish(false);
    }, timeoutMs);

    proc.on("close", (code) => finish(code === 0));
    proc.on("error", () => finish(false));
  });
}

export async function checkInternetConnectivity(
  force = false,
): Promise<InternetConnectivityResult> {
  const now = Date.now();
  if (
    !force &&
    internetConnectivityCache &&
    now - internetConnectivityCache.checkedAt < INTERNET_CONNECTIVITY_CACHE_MS
  ) {
    return internetConnectivityCache;
  }

  const pingArgs = process.platform === "win32"
    ? ["-n", "1", "-w", "2500", "1.1.1.1"]
    : ["-c", "1", "-W", "3", "1.1.1.1"];

  const checks: Array<{
    method: NonNullable<InternetConnectivityResult["method"]>;
    command: string;
    args: string[];
    timeoutMs: number;
  }> = [
    {
      method: "curl",
      command: "curl",
      args: ["--head", "--silent", "--max-time", "4", "https://registry-1.docker.io/v2/"],
      timeoutMs: 5_000,
    },
    {
      method: "nslookup",
      command: "nslookup",
      args: ["registry-1.docker.io"],
      timeoutMs: 5_000,
    },
    {
      method: "ping",
      command: "ping",
      args: pingArgs,
      timeoutMs: 5_000,
    },
    {
      method: "docker-pull",
      command: "docker",
      args: ["pull", "hello-world:latest"],
      timeoutMs: 20_000,
    },
  ];

  for (const check of checks) {
    if (await runConnectivityCommand(check.command, check.args, check.timeoutMs)) {
      internetConnectivityCache = { online: true, method: check.method, checkedAt: now };
      return internetConnectivityCache;
    }
  }

  internetConnectivityCache = {
    online: false,
    detail: "curl, nslookup, ping, and docker pull checks all failed",
    checkedAt: now,
  };
  return internetConnectivityCache;
}

export function classifyDockerError(message: string): string {
  const text = message.trim();
  if (!text) return "";

  const msg = text.toLowerCase();

  if (
    msg.includes("docker compose not found") ||
    msg.includes("executable file not found") ||
    msg.includes("command not found")
  ) {
    return "Docker CLI or Compose is not installed or not on PATH. Install Docker Desktop and restart the terminal.";
  }

  if (
    msg.includes("cannot connect to the docker daemon") ||
    msg.includes("is the docker daemon running") ||
    msg.includes("docker daemon is not running") ||
    msg.includes("error during connect")
  ) {
    return "Docker is not reachable. Start Docker Desktop or the Docker daemon, then retry.";
  }

  if (
    msg.includes("permission denied") &&
    (msg.includes("docker.sock") || msg.includes("docker daemon") || msg.includes("/var/run/docker"))
  ) {
    return "Docker permission denied. Give this user Docker access or run the terminal with Docker permissions.";
  }

  if (
    msg.includes("address already in use") ||
    msg.includes("port is already allocated") ||
    msg.includes("ports are not available") ||
    (msg.includes("bind") && msg.includes("listen tcp"))
  ) {
    return "A required host port is already in use. Stop the conflicting service or choose another runtime port range.";
  }

  if (
    msg.includes("temporary failure in name resolution") ||
    msg.includes("no such host") ||
    msg.includes("server misbehaving") ||
    (msg.includes("lookup") && msg.includes("dns"))
  ) {
    return "DNS lookup failed while contacting the Docker registry. Check internet and DNS, then retry.";
  }

  if (
    msg.includes("network is unreachable") ||
    msg.includes("connection timed out") ||
    msg.includes("i/o timeout") ||
    msg.includes("context deadline exceeded") ||
    msg.includes("tls handshake timeout") ||
    msg.includes("client.timeout exceeded")
  ) {
    return "Network connectivity failed while Docker contacted the registry. Cached images may still start offline.";
  }

  if (
    msg.includes("pull access denied") ||
    msg.includes("denied: requested access") ||
    msg.includes("authentication required") ||
    msg.includes("unauthorized")
  ) {
    return "Docker registry authentication failed. Check the GHCR token or run docker login.";
  }

  if (
    msg.includes("manifest unknown") ||
    msg.includes("manifest for") ||
    (msg.includes("not found") && msg.includes("image"))
  ) {
    return "Docker image or tag was not found in the registry. Check the generated image name and version tag.";
  }

  if (msg.includes("no space left on device")) {
    return "Docker is out of disk space. Free disk space or prune unused Docker images and volumes.";
  }

  if (msg.includes("invalid reference format")) {
    return "Docker image reference is invalid. Check the generated image name and tag.";
  }

  return "";
}

// ── Zone-compose helpers ──────────────────────────────────────────────────────

/**
 * Absolute path to a zone's managed compose artifact.
 *
 * Compose files are managed artifacts — they live outside the source repo
 * in the UNAXIS artifact store, mirroring Portainer's /data/compose/{id}/
 * pattern.  The repo's zones/<key>/docker-compose.yml is a scaffold template
 * only; the authoritative runtime copy lives here.
 *
 *   Windows:     %APPDATA%\unenter\stacks\<key>\docker-compose.yml
 *   macOS/Linux: ~/.unenter/stacks/<key>/docker-compose.yml
 */
export function zoneComposePath(key: string): string {
  return join(ARTIFACT_STORE_DIR, key, "docker-compose.yml");
}

/** True when the zone's managed compose artifact exists in the artifact store. */
export function zoneComposeExists(key: string): boolean {
  return existsSync(zoneComposePath(key));
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run `docker compose <args>` from the project root, streaming lines.
 *
 * @param args        Arguments after `docker compose`
 * @param onLine      Callback for each output line
 * @param composeFile Explicit compose file path (defaults to `docker-compose.yml` in cwd)
 * @param dockerUrl   Override DOCKER_HOST — e.g. `tcp://<host>:2375` for a remote
 *                    environment.  Omit to target the local Docker socket.
 */
export async function composeRun(
  args: string[],
  onLine?: (line: string) => void,
  composeFile?: string,
  dockerUrl?: string,
): Promise<number> {
  const cb       = onLine ?? (() => {});
  const fileFlag = composeFile ? ["-f", composeFile] : [];
  const proc = spawn("docker", ["compose", ...fileFlag, ...args], {
    cwd:   PROJECT_DIR,
    env:   makeDockerEnv(dockerUrl),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let code = 1;
  let output = "";
  const exited = new Promise<void>((resolve) => {
    proc.on("close", (c) => { code = c ?? 1; resolve(); });
    proc.on("error", (error) => {
      output += error.message;
      cb(`docker compose failed to start: ${error.message}`);
      resolve();
    });
  });

  // Docker/compose writes user-facing progress to stderr when piped (no TTY).
  // stdout is either empty or machine-readable JSON — draining both causes
  // every line to appear twice in the overlay.
  proc.stderr!.on("data", (data: Buffer) => {
    const chunk = data.toString();
    output += chunk;
    chunk.split("\n").filter(Boolean).forEach(cb);
  });
  proc.stdout!.on("data", (data: Buffer) => {
    output += data.toString();
  });

  await exited;

  if (code !== 0) {
    const hint = classifyDockerError(output);
    if (hint) cb(`Hint: ${hint}`);
  }
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

// ── Proxy admin health ────────────────────────────────────────────────────────

import { PROXY_ADMIN_URL } from "./proxy-config.ts";

/**
 * Ping the proxy's internal admin API (/health).
 * Returns true when reachable — false if the proxy process has crashed or
 * restarted but the container itself is still "running".
 * Timeout: 2 s (fast — this runs on every poll cycle).
 */
async function checkProxyAdmin(): Promise<boolean> {
  try {
    const res = await fetch(`${PROXY_ADMIN_URL}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Poll all zones + proxy in parallel and return a status map. */
export async function pollAll(
  zones: Zone[]
): Promise<{ zoneStatuses: Record<string, Status>; proxyStatus: Status }> {
  const [statuses, adminOk] = await Promise.all([
    getStatuses([PROXY.container, ...zones.map((z) => z.container)]),
    checkProxyAdmin(),
  ]);

  const zoneStatuses: Record<string, Status> = {};
  zones.forEach((z) => { zoneStatuses[z.key] = statuses[z.container] ?? "missing"; });

  let proxyStatus: Status = statuses[PROXY.container] ?? "missing";
  // Container "running" but admin API dark → process crashed / restarting.
  // Surface as "unhealthy" so the TUI dot goes red instead of green.
  if (proxyStatus === "running" && !adminOk) proxyStatus = "unhealthy";

  return { zoneStatuses, proxyStatus };
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
 * Ensure Docker is authenticated to ghcr.io before a pull.
 *
 * Reads the raw PAT from secureStorage("ghcr_token") and runs
 * `docker login ghcr.io --password-stdin` so that `compose pull` never fails
 * with "denied" even when Docker Desktop's credential store is stale.
 *
 * Silent no-op if no token is stored — the pull will use whatever Docker's
 * existing credential state is (may still work if the user ran docker login
 * manually, or if the image is public).
 */
async function ensureGhcrLogin(onLine?: (l: string) => void): Promise<void> {
  let pat: string | null = null;
  try {
    pat = await getCredential("ghcr_token");
  } catch {
    // Credential store unavailable — skip, let the pull try on its own.
    return;
  }
  if (!pat?.trim()) return;

  // docker login reads the password from stdin so the token never appears in
  // the process argument list (no leak in `ps` output or TUI log lines).
  await new Promise<void>((resolve) => {
    const proc = spawn(
      "docker",
      ["login", "ghcr.io", "--username", GHCR_USER, "--password-stdin"],
      { env: makeDockerEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    proc.stdout!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.stderr!.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        onLine?.("✓ GHCR login refreshed");
      } else {
        onLine?.(`  GHCR login warning: ${out.trim().split("\n").pop() ?? "unknown error"}`);
      }
      resolve();
    });
    proc.on("error", () => resolve()); // docker not found — non-fatal
    proc.stdin!.end(pat!.trim());
  });
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
  zone:      Zone,
  onLine?:   (l: string) => void,
  dockerUrl?: string,
): Promise<number> {
  const newStyle = zoneComposeExists(zone.key);
  const file     = newStyle ? zoneComposePath(zone.key) : undefined;

  // Legacy zones only: self-heal missing `image:` field in root compose.
  if (!newStyle) doctorComposeService(zone, onLine);

  const internet = await checkInternetConnectivity();
  if (internet.online) {
    // Refresh GHCR credentials before pulling — prevents "denied" errors when
    // Docker Desktop's credential store is stale after a push from the TUI.
    await ensureGhcrLogin(onLine);
    onLine?.(`Pulling ${zone.image}...`);
    const pullCode = await composeRun(["pull", zone.service], onLine, file, dockerUrl);
    if (pullCode !== 0) return pullCode;
  } else {
    onLine?.("No internet connectivity detected; skipping pull and using cached image if available.");
    onLine?.("If the image is not cached locally, Docker will fail during startup.");
  }

  onLine?.(`Starting ${zone.service} (force-recreate)...`);
  return composeRun(["up", "-d", "--no-build", "--force-recreate", zone.service], onLine, file, dockerUrl);
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
 * Using `up -d --no-build --force-recreate` recreates the container with the
 * current compose env without triggering a Docker image build.
 *
 * NOTE: --no-build (not --build) is intentional here.  proxy/server.js and
 * proxy/agent.js are BIND-MOUNTED into the container at runtime, so node --watch
 * inside the container picks up file changes instantly — no image rebuild ever
 * needed.  Using --build caused docker compose to also rebuild the app image
 * (a 10-min Next.js build) because proxy depends_on app.
 */
export async function reloadProxy(onLine?: (l: string) => void): Promise<number> {
  onLine?.("Recreating proxy (unt_proxy)...");
  return composeRun(
    ["up", "-d", "--no-build", "--force-recreate", PROXY.service],
    onLine,
  );
}

/**
 * Rebuild the proxy Docker image from proxy/Dockerfile and recreate the container.
 *
 * Used by the explicit [b] Build action — handles cases where the proxy image
 * itself needs updating (e.g. new npm packages in proxy/Dockerfile, base image
 * update).  Distinct from reloadProxy() which skips the image build and is
 * used for env-var-only refreshes triggered by zone scaffolding.
 *
 * noCache: pass true for [R] Rebuild (no cache) to force a clean image build.
 */
export async function rebuildProxy(
  onLine?:  (l: string) => void,
  noCache?: boolean,
): Promise<number> {
  // Two-step: build then recreate.
  // `docker compose up --build` requires a service-level `image:` tag for
  // schema validation in Compose v2 — the proxy uses only `build:` (local
  // image, not pushed to GHCR), so we separate the steps to avoid the error.
  onLine?.(`Building proxy image${noCache ? " (no cache)" : ""}...`);
  const buildCode = await composeRun(
    ["build", ...(noCache ? ["--no-cache"] : []), PROXY.service],
    onLine,
  );
  if (buildCode !== 0) return buildCode;

  onLine?.("Recreating proxy container (unt_proxy)...");
  return composeRun(
    ["up", "-d", "--no-build", "--force-recreate", PROXY.service],
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
