// src/ink/agent-ops.ts
// ─────────────────────────────────────────────────────────────────────────────
// Agent build / push / remote-update pipeline.
//
// buildAndPushAgent(onLine)
//   Builds ghcr.io/untsystems/unaxis-agent:v0 from packages/agent-node/ on the
//   LOCAL Docker socket, logs in to GHCR, then pushes.
//   Mirrors the pullAndUp() pattern from docker.ts.
//
// updateRemoteAgent(env, onLine)
//   Bootstrap-safe agent self-update via the signed agent HTTP API:
//     1. Stop + remove the running unaxis_agent container (simple proxy paths)
//     2. Redeploy via /stacks/deploy with a compose YAML (pull_policy: always)
//        → docker compose runs `docker pull` via CLI, bypassing the proxy
//     3. Poll /health until the new version responds
// ─────────────────────────────────────────────────────────────────────────────

import { spawn }        from "child_process";
import { readFileSync } from "fs";
import { join }         from "path";
import { PROJECT_DIR, GHCR_USER } from "../config/zones.ts";
import { getCredential }          from "../utils/secureStorage/index.js";
import { agentFetch, dockerFetch, pingAgent } from "./agent-client.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

export const AGENT_IMAGE      = `ghcr.io/${GHCR_USER}/unaxis-agent`;
export const AGENT_TAG        = "v0";
export const AGENT_FULL       = `${AGENT_IMAGE}:${AGENT_TAG}`;
// Build context is repo root so the Dockerfile can COPY proxy/agent.js.
// Dockerfile path is passed explicitly via -f.
export const AGENT_CONTEXT    = PROJECT_DIR;
export const AGENT_DOCKERFILE = join(PROJECT_DIR, "packages", "agent-node", "Dockerfile");
// Canonical agent source — single file shared by embedded proxy + standalone image.
export const AGENT_SOURCE     = join(PROJECT_DIR, "proxy", "agent.js");

export const UPDATER_IMAGE   = `ghcr.io/${GHCR_USER}/unaxis-updater`;
export const UPDATER_TAG     = "v0";
export const UPDATER_FULL    = `${UPDATER_IMAGE}:${UPDATER_TAG}`;
export const UPDATER_CONTEXT = join(PROJECT_DIR, "packages", "agent-updater");

const AGENT_CONTAINER = "unaxis_agent";

// ── Version reader ────────────────────────────────────────────────────────────
// Reads AGENT_VERSION from agent.js source so the TUI knows what version it
// just built — used for pinned tags and post-update version verification.
function readAgentVersion(): string {
  try {
    const src = readFileSync(AGENT_SOURCE, "utf8");
    const m   = src.match(/const AGENT_VERSION\s*=\s*["']([^"']+)["']/);
    return m?.[1] ?? "";
  } catch {
    return "";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLocalDockerEnv(): Record<string, string> {
  const localSocket =
    process.platform !== "win32"
      ? { DOCKER_HOST: "unix:///var/run/docker.sock" }
      : {};
  return {
    ...(process.env as Record<string, string>),
    ...localSocket,
  };
}

/**
 * Spawn a docker command locally, streaming stdout+stderr to onLine.
 * Returns the exit code.
 */
function spawnDocker(
  args:   string[],
  onLine: (line: string) => void,
  stdinData?: string,
): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("docker", args, {
      env:   makeLocalDockerEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const emit = (data: Buffer) => {
      data.toString().split("\n").filter(Boolean).forEach(onLine);
    };
    proc.stdout!.on("data", emit);
    proc.stderr!.on("data", emit);

    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", (err) => {
      onLine(`docker error: ${err.message}`);
      resolve(1);
    });

    if (stdinData !== undefined) {
      proc.stdin!.end(stdinData);
    } else {
      proc.stdin!.end();
    }
  });
}

/**
 * Log in to GHCR using the stored PAT.
 * Silent no-op if no token is stored — subsequent push may still work if
 * Docker Desktop has valid credentials.
 */
async function ensureGhcrLogin(onLine: (line: string) => void): Promise<void> {
  let pat: string | null = null;
  try {
    pat = await getCredential("ghcr_token");
  } catch {
    return; // credential store unavailable
  }
  if (!pat?.trim()) {
    onLine("⚠ No GHCR token stored — push may fail if not already logged in.");
    return;
  }

  const code = await spawnDocker(
    ["login", "ghcr.io", "--username", GHCR_USER, "--password-stdin"],
    (line) => onLine(`  ${line}`),
    pat.trim(),
  );

  if (code === 0) {
    onLine("✓ GHCR login OK");
  } else {
    onLine("⚠ GHCR login failed — push may fail");
  }
}

// ── Build + push (local) ──────────────────────────────────────────────────────

/**
 * Build the agent image from packages/agent-node/ on the local Docker socket,
 * then push to GHCR.
 *
 * Output is streamed line-by-line to onLine so the TUI log overlay shows
 * real-time progress, identical to pullAndUp().
 *
 * Returns 0 on success, non-zero on any failure.
 */
export async function buildAndPushAgent(
  onLine: (line: string) => void,
): Promise<number> {
  // ── 1. Build agent ────────────────────────────────────────────────────────
  onLine(`Building ${AGENT_FULL} from ${AGENT_SOURCE} ...`);
  const agentBuildCode = await spawnDocker(
    ["build", "-f", AGENT_DOCKERFILE, "-t", AGENT_FULL, AGENT_CONTEXT],
    onLine,
  );
  if (agentBuildCode !== 0) {
    onLine(`✗ Agent build failed (exit ${agentBuildCode})`);
    return agentBuildCode;
  }
  onLine(`✓ Agent build complete`);

  // ── 2. Build updater ──────────────────────────────────────────────────────
  onLine(`Building ${UPDATER_FULL} from ${UPDATER_CONTEXT} ...`);
  const updaterBuildCode = await spawnDocker(
    ["build", "-t", UPDATER_FULL, UPDATER_CONTEXT],
    onLine,
  );
  if (updaterBuildCode !== 0) {
    onLine(`✗ Updater build failed (exit ${updaterBuildCode})`);
    return updaterBuildCode;
  }
  onLine(`✓ Updater build complete`);

  // ── 3. GHCR login ────────────────────────────────────────────────────────
  await ensureGhcrLogin(onLine);

  // ── 4. Push agent :v0 ────────────────────────────────────────────────────
  onLine(`Pushing ${AGENT_FULL} ...`);
  const agentPushCode = await spawnDocker(["push", AGENT_FULL], onLine);
  if (agentPushCode !== 0) {
    onLine(`✗ Agent push failed (exit ${agentPushCode})`);
    return agentPushCode;
  }
  onLine(`✓ Agent push complete — ${AGENT_FULL}`);

  // ── 5. Push agent pinned version tag ─────────────────────────────────────
  const agentVersion = readAgentVersion();
  if (agentVersion) {
    const pinnedAgent = `${AGENT_IMAGE}:${agentVersion}`;
    await spawnDocker(["tag", AGENT_FULL, pinnedAgent], onLine);
    const pinnedAgentCode = await spawnDocker(["push", pinnedAgent], onLine);
    if (pinnedAgentCode !== 0) {
      onLine(`⚠ Pinned agent tag push failed — continuing`);
    } else {
      onLine(`✓ Pinned agent tag pushed — ${pinnedAgent}`);
    }
  }

  // ── 6. Push updater :v0 ───────────────────────────────────────────────────
  onLine(`Pushing ${UPDATER_FULL} ...`);
  const updaterPushCode = await spawnDocker(["push", UPDATER_FULL], onLine);
  if (updaterPushCode !== 0) {
    onLine(`✗ Updater push failed (exit ${updaterPushCode})`);
    return updaterPushCode;
  }
  onLine(`✓ Updater push complete — ${UPDATER_FULL}`);

  // ── 7. Push updater pinned version tag ───────────────────────────────────
  if (agentVersion) {
    const pinnedUpdater = `${UPDATER_IMAGE}:${agentVersion}`;
    await spawnDocker(["tag", UPDATER_FULL, pinnedUpdater], onLine);
    const pinnedUpdaterCode = await spawnDocker(["push", pinnedUpdater], onLine);
    if (pinnedUpdaterCode !== 0) {
      onLine(`⚠ Pinned updater tag push failed — continuing`);
    } else {
      onLine(`✓ Pinned updater tag pushed — ${pinnedUpdater}`);
    }
  }

  return 0;
}

// ── Remote update (via agent API) ─────────────────────────────────────────────

/**
 * Update the agent container on a remote environment via the Docker API
 * proxied through the agent itself.
 *
 * Steps:
 *   1. Pull new image
 *   2. Stop existing container
 *   3. Remove existing container
 *   4. Recreate + start with original deploy flags
 *   5. Poll /health until the new version responds (or timeout)
 *
 * Returns 0 on success, non-zero on failure.
 */
export async function updateRemoteAgent(
  env:    UnaxisEnvironment,
  onLine: (line: string) => void,
): Promise<number> {
  const agentBase = env.agentUrl.replace(/\/$/, "");
  if (!agentBase) {
    onLine("✗ Environment has no agent_url configured");
    return 1;
  }

  // Self-update via POST /self-update (requires agent v0.1.4+).
  //
  // The agent can't be updated via the proxy-based Docker API because
  // stopping the container kills the proxy mid-flow.  The /self-update
  // endpoint sidesteps this:
  //   1. Agent pulls the new image (synchronous, while still alive)
  //   2. Agent responds 202 so we can start polling
  //   3. Agent spawns a detached `docker run -d --name … --replace …`
  //      The Docker daemon handles stop+rm+create+start atomically.
  //      The agent process is killed when the daemon stops the container,
  //      but the daemon continues and the new container starts anyway.
  //
  // Note: `docker run --replace` requires Docker Engine 25.0+.
  // If the agent is older than v0.1.4 this returns 404 — rebuild and
  // deploy the agent manually, then all future TUI updates work.

  onLine(`Initiating self-update to ${AGENT_FULL} on ${env.name} ...`);
  try {
    const res = await agentFetch(env, "/self-update", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ref: AGENT_FULL }),
      signal:  AbortSignal.timeout(120_000),  // pull can take time
    });

    if (res.status === 404) {
      onLine(`✗ Agent does not support /self-update (requires v0.1.4+)`);
      onLine(`  Bootstrap manually: rebuild the agent on L0V3, then TUI updates will work.`);
      return 1;
    }
    if (!res.ok) {
      const text = await res.text();
      onLine(`✗ Self-update failed: HTTP ${res.status} — ${text}`);
      return 1;
    }
    const data = (await res.json()) as { ok: boolean; ref?: string; status?: string };
    if (!data.ok) {
      onLine(`✗ Agent rejected self-update`);
      return 1;
    }
    onLine(`✓ Agent acknowledged — pulling new image and replacing container`);
  } catch (err) {
    onLine(`✗ Self-update request failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  // ── Poll health — agent is restarting, longer timeout ────────────────────
  // Also allow time for the updater's health-check loop (up to 100s) before
  // the new container is confirmed healthy and the rollback container is removed.
  onLine(`Waiting for new agent to come online ...`);

  const expectedVersion  = readAgentVersion();
  const POLL_INTERVAL_MS = 2_000;
  const POLL_TIMEOUT_MS  = 120_000;   // 2 min — covers updater health loop (100s)
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const health = await pingAgent(env);
    if (health.online) {
      // ── Version verification ──────────────────────────────────────────────
      if (expectedVersion && health.version !== expectedVersion) {
        onLine(`⚠ Version mismatch — agent responded with ${health.version}, expected ${expectedVersion}`);
        onLine(`  The updater may have rolled back to the previous version.`);
        onLine(`  Check L0V3 agent logs for updater details.`);
        return 1;
      }
      onLine(`✓ Agent online — version ${health.version}`);
      return 0;
    }
  }

  onLine(`⚠ Agent did not respond within ${POLL_TIMEOUT_MS / 1000}s — check remote logs`);
  return 1;
}
