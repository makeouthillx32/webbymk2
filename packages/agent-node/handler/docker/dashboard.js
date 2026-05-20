// handler/docker/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Docker Dashboard aggregator.
// Mirrors: api/http/handler/docker/dashboard.go  (Portainer OSS)
//
// Response shape matches Portainer's dashboardResponse struct exactly:
//
//   type dashboardResponse struct {
//     Containers ContainerStats  `json:"containers"`
//     Services   int             `json:"services"`
//     Images     imagesCounters  `json:"images"`   // { total, size }
//     Volumes    int             `json:"volumes"`
//     Networks   int             `json:"networks"`
//     Stacks     int             `json:"stacks"`
//   }
//
// Additionally we include an `info` block (UNAXIS extension — not in
// Portainer's spec) with CPU / RAM / docker version for the env header.
//
// Key implementation details from Portainer source:
//
//   Container health — CalculateContainerStats() does NOT rely on the summary
//   string from /containers/json. It calls ContainerInspect on each container
//   (max 5 concurrent) to get accurate State.Health.Status.
//   Source: api/docker/stats/container_stats.go
//
//   Stack counting — GetDockerStacks() unions:
//     1. Managed stacks from portainer.db  (we shim this — always 0 for now)
//     2. External compose stacks via label: com.docker.compose.project
//     3. External swarm stacks via label:   com.docker.stack.namespace
//     Stacks with the "hide.stack" label are excluded.
//   Source: api/http/handler/docker/utils/get_stacks.go
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const http = require("http");

// ── Docker label constants ────────────────────────────────────────────────────
// Mirrors: api/docker/consts/consts.go (Portainer)

const COMPOSE_STACK_NAME_LABEL = "com.docker.compose.project";
const SWARM_STACK_NAME_LABEL   = "com.docker.stack.namespace";
const HIDE_STACK_LABEL         = "hide.stack"; // portainer: dockerconsts.HideStackLabel

// ── Internal Docker helpers ───────────────────────────────────────────────────

/**
 * GET a Docker API path and return parsed JSON.
 *
 * @param {string} socketPath
 * @param {string} path  e.g. "/containers/json?all=1"
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<unknown>}
 */
function dockerGet(socketPath, path, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch (err) { reject(new Error(`Bad JSON from Docker ${path}: ${err.message}`)); }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: Docker ${path}`)));
    req.end();
  });
}

/**
 * Run tasks with a maximum concurrency cap.
 * Mirrors the semaphore pattern in Portainer's CalculateContainerStats.
 *
 * @param {Array<() => Promise<T>>} tasks
 * @param {number} limit
 * @returns {Promise<Array<{ status: "fulfilled"|"rejected", value?: T, reason?: unknown }>>}
 */
async function withConcurrency(tasks, limit) {
  const results  = new Array(tasks.length);
  let   next     = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() };
      } catch (err) {
        results[i] = { status: "rejected", reason: err };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Container health (via deep inspect) ──────────────────────────────────────

/**
 * Map an inspected container's State to our counter buckets.
 * Mirrors Portainer's getContainerStatus(state *container.State) ContainerStats.
 *
 * Docker inspect State fields:
 *   Status  — "running" | "exited" | "dead" | "paused" | "restarting" | ...
 *   Health  — { Status: "healthy" | "unhealthy" | "starting" | "" }
 *
 * @param {{ Status: string; Health?: { Status: string } } | null} state
 * @returns {{ running: number, stopped: number, healthy: number, unhealthy: number }}
 */
function getContainerStatus(state) {
  const s = { running: 0, stopped: 0, healthy: 0, unhealthy: 0 };
  if (!state) return s;

  switch (state.Status) {
    case "running":                       s.running++;  break;
    case "exited": case "dead":           s.stopped++;  break;
  }

  if (state.Health) {
    switch (state.Health.Status) {
      case "healthy":   s.healthy++;   break;
      case "unhealthy": s.unhealthy++; break;
    }
  }

  return s;
}

/**
 * Calculate container stats using deep inspect per container.
 * Mirrors Portainer's CalculateContainerStats() in api/docker/stats/container_stats.go.
 *
 * Portainer calls ContainerInspect on each container (max 5 concurrent) because
 * the Health.Status field is not fully populated in the /containers/json summary.
 * For Swarm environments it falls back to summary string parsing.
 *
 * @param {string}  socketPath
 * @param {Array}   containers  — result of /containers/json?all=1
 * @param {boolean} isSwarm
 * @returns {Promise<ContainerStats>}
 *
 * @typedef {{ total, running, stopped, healthy, unhealthy }} ContainerStats
 */
async function calculateContainerStats(socketPath, containers, isSwarm = false) {
  if (isSwarm) {
    // Mirrors CalculateContainerStatsForSwarm — uses summary strings (no inspect)
    let running = 0, stopped = 0, healthy = 0, unhealthy = 0;
    for (const c of containers) {
      switch (c.State) {
        case "running":                       running++;  break;
        case "exited": case "stopped":        stopped++;  break;
      }
      if (c.Status?.includes("(healthy)"))   healthy++;
      if (c.Status?.includes("(unhealthy)")) unhealthy++;
    }
    return { total: containers.length, running, stopped, healthy, unhealthy };
  }

  // Non-swarm: deep inspect each container, max 5 concurrent.
  // Mirrors the semaphore := make(chan struct{}, 5) pattern in Portainer.
  const tasks = containers.map((c) => async () => {
    try {
      const inspected = await dockerGet(socketPath, `/containers/${c.Id}/json`, 5_000);
      return getContainerStatus(inspected?.State ?? null);
    } catch {
      // Container deleted between list and inspect — skip (mirrors Portainer's errdefs.IsNotFound check)
      return null;
    }
  });

  const settled = await withConcurrency(tasks, 5);

  let running = 0, stopped = 0, healthy = 0, unhealthy = 0, total = 0;
  for (const result of settled) {
    if (result.status !== "fulfilled" || result.value === null) continue;
    const s = result.value;
    running   += s.running;
    stopped   += s.stopped;
    healthy   += s.healthy;
    unhealthy += s.unhealthy;
    total++;
  }

  return { total, running, stopped, healthy, unhealthy };
}

// ── Stack counting ────────────────────────────────────────────────────────────

/**
 * Count Docker stacks (managed + external compose + external swarm).
 * Mirrors Portainer's GetDockerStacks() in api/http/handler/docker/utils/get_stacks.go.
 *
 * Portainer unions:
 *   1. Managed stacks from portainer.db  → we shim as 0 (no local DB yet)
 *   2. External compose stacks via label  com.docker.compose.project
 *   3. External swarm stacks via label    com.docker.stack.namespace
 *   Stacks with the hide.stack label are excluded (isHiddenStack check).
 *
 * @param {Array} containers  — result of /containers/json?all=1
 * @param {Array} [services]  — result of /services (swarm only)
 * @returns {number}  total unique stack count
 */
function getDockerStacks(containers, services = []) {
  const stacksNameSet = new Set();

  // 2. External compose stacks (containers)
  for (const c of containers) {
    const labels = c.Labels ?? {};
    if (labels[HIDE_STACK_LABEL]) continue;          // isHiddenStack
    const name = labels[COMPOSE_STACK_NAME_LABEL];
    if (name) stacksNameSet.add(name);
  }

  // 3. External swarm stacks (services)
  for (const svc of services) {
    const labels = svc.Spec?.Labels ?? {};
    if (labels[HIDE_STACK_LABEL]) continue;          // isHiddenStack
    const name = labels[SWARM_STACK_NAME_LABEL];
    if (name) stacksNameSet.add(name);
  }

  // 1. Managed stacks — TODO: query managed_stacks from Supabase and add names
  // For now, the external count equals total (no overlap with managed).
  return stacksNameSet.size;
}

// ── Dashboard builder ─────────────────────────────────────────────────────────

/**
 * Build the full dashboard response.
 * Mirrors the handler function body in Portainer's dashboard.go.
 *
 * Response shape matches Portainer's dashboardResponse exactly, plus an `info`
 * extension block (UNAXIS-only, not in Portainer's spec).
 *
 * @param {string} socketPath
 * @returns {Promise<DashboardResponse>}
 *
 * @typedef {Object} DashboardResponse
 * @property {ContainerStats} containers
 * @property {number}         services    — swarm service count (0 on standalone)
 * @property {{ total: number, size: number }} images
 * @property {number}         volumes
 * @property {number}         networks
 * @property {number}         stacks
 * @property {object}         info        — UNAXIS extension (cpu, memory, docker version, …)
 */
async function buildDashboard(socketPath) {
  // Parallel base fetch — mirrors Portainer's concurrent Docker API calls
  const [containers, images, volumeBody, networks, info] = await Promise.all([
    dockerGet(socketPath, "/containers/json?all=1"),
    dockerGet(socketPath, "/images/json"),
    dockerGet(socketPath, "/volumes"),
    dockerGet(socketPath, "/networks"),
    dockerGet(socketPath, "/info"),
  ]);

  const isSwarm = !!(info?.Swarm?.ControlAvailable);

  // Swarm: fetch services for stack counting + service count
  let services = [];
  if (isSwarm) {
    try {
      services = await dockerGet(socketPath, "/services") ?? [];
    } catch {
      // Non-fatal — swarm may be unavailable
    }
  }

  const safeContainers = Array.isArray(containers) ? containers : [];
  const safeImages     = Array.isArray(images)     ? images     : [];
  const safeNetworks   = Array.isArray(networks)   ? networks   : [];
  const safeServices   = Array.isArray(services)   ? services   : [];

  // calculateContainerStats — deep inspect per container (Portainer approach)
  const containerStats = await calculateContainerStats(socketPath, safeContainers, isSwarm);

  // imagesCounters — { total, size } mirrors Portainer's imagesCounters struct
  const totalImageSize = safeImages.reduce((sum, img) => sum + (img.Size ?? 0), 0);

  return {
    // ── Portainer-spec fields ─────────────────────────────────────────
    containers: containerStats,
    services:   safeServices.length,
    images:     { total: safeImages.length, size: totalImageSize },
    volumes:    volumeBody?.Volumes?.length ?? 0,
    networks:   safeNetworks.length,
    stacks:     getDockerStacks(safeContainers, safeServices),

    // ── UNAXIS extension (not in Portainer's dashboardResponse) ──────
    info: {
      dockerVersion: info?.ServerVersion     ?? "",
      apiVersion:    info?.ApiVersion        ?? "",
      cpu:           info?.NCPU              ?? 0,
      memory:        info?.MemTotal          ?? 0,
      swarm:         isSwarm,
      os:            info?.OperatingSystem   ?? "",
      kernel:        info?.KernelVersion     ?? "",
    },
  };
}

module.exports = { buildDashboard };
