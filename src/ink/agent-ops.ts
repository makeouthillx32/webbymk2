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
//   Uses the signed agent HTTP API (dockerFetch) to:
//     1. Pull the new image on the remote machine
//     2. Stop + remove the running unaxis_agent container
//     3. Recreate + start it with the same flags
//     4. Poll /health until the new version responds
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "child_process";
import { join }  from "path";
import { PROJECT_DIR, GHCR_USER } from "../config/zones.ts";
import { getCredential }          from "../utils/secureStorage/index.js";
import { dockerFetch, pingAgent } from "./agent-client.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

export const AGENT_IMAGE   = `ghcr.io/${GHCR_USER}/unaxis-agent`;
export const AGENT_TAG     = "v0";
export const AGENT_FULL    = `${AGENT_IMAGE}:${AGENT_TAG}`;
export const AGENT_CONTEXT = join(PROJECT_DIR, "packages", "agent-node");

const AGENT_CONTAINER = "unaxis_agent";

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
  // ── 1. Build ─────────────────────────────────────────────────────────────
  onLine(`Building ${AGENT_FULL} from ${AGENT_CONTEXT} ...`);
  const buildCode = await spawnDocker(
    ["build", "-t", AGENT_FULL, AGENT_CONTEXT],
    onLine,
  );

  if (buildCode !== 0) {
    onLine(`✗ Build failed (exit ${buildCode})`);
    return buildCode;
  }
  onLine(`✓ Build complete`);

  // ── 2. GHCR login ────────────────────────────────────────────────────────
  await ensureGhcrLogin(onLine);

  // ── 3. Push ──────────────────────────────────────────────────────────────
  onLine(`Pushing ${AGENT_FULL} ...`);
  const pushCode = await spawnDocker(["push", AGENT_FULL], onLine);

  if (pushCode !== 0) {
    onLine(`✗ Push failed (exit ${pushCode})`);
    return pushCode;
  }
  onLine(`✓ Push complete — ${AGENT_FULL}`);
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

  // ── 1. Pull new image on remote ──────────────────────────────────────────
  onLine(`Pulling ${AGENT_FULL} on ${env.name} ...`);
  try {
    // fromImage and tag must NOT be percent-encoded — Docker's API returns 400
    // if slashes in the image name are encoded as %2F.
    const pullRes = await dockerFetch(
      env,
      `/v1.43/images/create?fromImage=${AGENT_IMAGE}&tag=${AGENT_TAG}`,
      { method: "POST" },
    );

    // Docker image pull streams newline-delimited JSON progress events.
    // Consume and surface each status line.
    const text = await pullRes.text();
    for (const chunk of text.split("\n").filter(Boolean)) {
      try {
        const evt = JSON.parse(chunk) as { status?: string; error?: string; progressDetail?: unknown };
        if (evt.error) {
          onLine(`✗ Pull error: ${evt.error}`);
          return 1;
        }
        if (evt.status && !evt.progressDetail) onLine(`  ${evt.status}`);
      } catch {
        // Non-JSON chunk — emit as-is
        onLine(`  ${chunk}`);
      }
    }

    if (!pullRes.ok && pullRes.status !== 200) {
      onLine(`✗ Pull failed: HTTP ${pullRes.status}`);
      return 1;
    }
  } catch (err) {
    onLine(`✗ Pull request failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  onLine(`✓ Image pulled`);

  // ── 2. Stop container ────────────────────────────────────────────────────
  onLine(`Stopping ${AGENT_CONTAINER} ...`);
  try {
    await dockerFetch(
      env,
      `/v1.43/containers/${AGENT_CONTAINER}/stop?t=10`,
      { method: "POST" },
    );
    // 204 = stopped, 304 = already stopped, 404 = not found — all acceptable here
  } catch {
    // Non-fatal: container may not exist yet
  }
  onLine(`✓ Stopped`);

  // ── 3. Remove container ──────────────────────────────────────────────────
  onLine(`Removing ${AGENT_CONTAINER} ...`);
  try {
    await dockerFetch(
      env,
      `/v1.43/containers/${AGENT_CONTAINER}?force=true`,
      { method: "DELETE" },
    );
  } catch {
    // Non-fatal
  }
  onLine(`✓ Removed`);

  // ── 4. Recreate + start ──────────────────────────────────────────────────
  onLine(`Creating ${AGENT_CONTAINER} ...`);

  const createBody = JSON.stringify({
    Image:        AGENT_FULL,
    ExposedPorts: { "8888/tcp": {} },
    HostConfig: {
      // Bind the Docker socket so the agent can proxy to it.
      // Also bind a named volume for /data so TOFU pairing survives restarts.
      Binds: [
        "/var/run/docker.sock:/var/run/docker.sock",
        "unaxis_agent_data:/data",
      ],
      PortBindings: { "8888/tcp": [{ HostIp: "0.0.0.0", HostPort: "8888" }] },
      RestartPolicy: { Name: "unless-stopped" },
    },
  });

  let createOk = false;
  try {
    const createRes = await dockerFetch(
      env,
      `/v1.43/containers/create?name=${AGENT_CONTAINER}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    createBody,
      },
    );
    if (createRes.ok || createRes.status === 201) {
      createOk = true;
    } else {
      const body = await createRes.text();
      onLine(`✗ Create failed: HTTP ${createRes.status} — ${body}`);
      return 1;
    }
  } catch (err) {
    onLine(`✗ Create request failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  if (createOk) {
    onLine(`✓ Container created`);
    onLine(`Starting ${AGENT_CONTAINER} ...`);
    try {
      await dockerFetch(
        env,
        `/v1.43/containers/${AGENT_CONTAINER}/start`,
        { method: "POST" },
      );
    } catch (err) {
      onLine(`✗ Start failed: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
    onLine(`✓ Started`);
  }

  // ── 5. Poll health ───────────────────────────────────────────────────────
  onLine(`Waiting for agent to come online ...`);

  const POLL_INTERVAL_MS = 2_000;
  const POLL_TIMEOUT_MS  = 30_000;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const health = await pingAgent(env);
    if (health.online) {
      onLine(`✓ Agent online — version ${health.version}`);
      return 0;
    }
  }

  onLine(`⚠ Agent did not respond within ${POLL_TIMEOUT_MS / 1000}s — check remote logs`);
  return 1;
}
