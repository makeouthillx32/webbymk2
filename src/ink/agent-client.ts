// src/ink/agent-client.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS Agent HTTP client — TUI side of the agent connection.
//
// Auth model: Trust on First Use (TOFU) with ECDSA P-256, same as Portainer.
//
//   1. On first run the TUI generates a P-256 key pair and saves it to disk
//      (ARTIFACT_STORE_DIR/agent/tui-keypair.json).
//   2. Every request is signed:
//        X-PortainerAgent-Timestamp:  <unix_seconds>
//        X-PortainerAgent-Signature:  ECDSA-SHA256(private_key, timestamp) base64
//        X-PortainerAgent-PublicKey:  raw public key base64
//   3. The agent sees the public key for the first time → stores it → paired.
//      All future requests are verified against that stored key.
//      No AGENT_SECRET env var needed anywhere.
//
// The agent deploy command is simply:
//   docker run -d -p 8888:8888 \
//     -v /var/run/docker.sock:/var/run/docker.sock \
//     ghcr.io/untsystems/unaxis-agent:v0
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname }              from "path";
import type { UnaxisEnvironment }     from "./environment-store.ts";
import type { AgentHealthResult }     from "./environment-store.ts";
import { ARTIFACT_STORE_DIR }         from "../config/stack.ts";

// ── Key pair storage ──────────────────────────────────────────────────────────

const KEY_FILE = join(ARTIFACT_STORE_DIR, "agent", "tui-keypair.json");

/** Module-level cache — key pair is loaded/generated once per TUI session. */
let _keyPair: CryptoKeyPair | null = null;

/** Load the persisted key pair or generate a new one on first run. */
async function loadOrGenerateKeyPair(): Promise<CryptoKeyPair> {
  // Try loading from disk
  try {
    const stored = JSON.parse(await readFile(KEY_FILE, "utf-8")) as {
      privateKeyJwk: JsonWebKey;
      publicKeyB64:  string;
    };

    const privateKey = await crypto.subtle.importKey(
      "jwk",
      stored.privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const publicKey = await crypto.subtle.importKey(
      "raw",
      Buffer.from(stored.publicKeyB64, "base64"),
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"],
    );
    return { privateKey, publicKey };
  } catch {
    // First run — generate a new P-256 key pair.
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );

    const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
    const publicKeyRaw  = await crypto.subtle.exportKey("raw", keyPair.publicKey);

    await mkdir(dirname(KEY_FILE), { recursive: true });
    await writeFile(
      KEY_FILE,
      JSON.stringify({
        privateKeyJwk,
        publicKeyB64: Buffer.from(publicKeyRaw as ArrayBuffer).toString("base64"),
      }),
      "utf-8",
    );

    return keyPair;
  }
}

/** Cached accessor — safe to call on every request. */
export async function getAgentKeyPair(): Promise<CryptoKeyPair> {
  if (!_keyPair) _keyPair = await loadOrGenerateKeyPair();
  return _keyPair;
}

// ── ECDSA signing ─────────────────────────────────────────────────────────────

/**
 * Build the Portainer-compatible auth headers for a request to the agent.
 * Includes the public key so unpaired agents can perform TOFU pairing.
 */
async function buildSignatureHeaders(): Promise<Record<string, string>> {
  const keyPair = await getAgentKeyPair();

  const ts     = Math.floor(Date.now() / 1000).toString();
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPair.privateKey,
    new TextEncoder().encode(ts),
  );
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  return {
    "X-PortainerAgent-Timestamp": ts,
    "X-PortainerAgent-Signature": Buffer.from(sigBuf).toString("base64"),
    "X-PortainerAgent-PublicKey": Buffer.from(publicKeyRaw as ArrayBuffer).toString("base64"),
  };
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Signed fetch to the UNAXIS agent.
 * Prepends agentUrl automatically — callers pass the path only (e.g. "/health").
 */
export async function agentFetch(
  env:   UnaxisEnvironment,
  path:  string,
  init?: RequestInit,
): Promise<Response> {
  const base   = env.agentUrl.replace(/\/$/, "");
  const url    = `${base}${path}`;
  const sigHdr = await buildSignatureHeaders();

  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...sigHdr,
    },
  });
}

/**
 * Signed fetch to the Docker proxy prefix on the agent.
 * path should be the Docker API path, e.g. "/containers/json".
 */
export async function dockerFetch(
  env:   UnaxisEnvironment,
  path:  string,
  init?: RequestInit,
): Promise<Response> {
  return agentFetch(env, `/docker${path}`, init);
}

// ── Dashboard response type ───────────────────────────────────────────────────
// Mirrors Portainer's dashboardResponse struct exactly:
//   api/http/handler/docker/dashboard.go
//
//   type dashboardResponse struct {
//     Containers ContainerStats `json:"containers"`
//     Services   int            `json:"services"`
//     Images     imagesCounters `json:"images"`   // { total, size }
//     Volumes    int            `json:"volumes"`
//     Networks   int            `json:"networks"`
//     Stacks     int            `json:"stacks"`
//   }
//
// ContainerStats — api/docker/stats/container_stats.go
//   type ContainerStats struct {
//     Running int; Stopped int; Healthy int; Unhealthy int; Total int
//   }
//
// `info` is a UNAXIS extension (not in Portainer's spec) — CPU/RAM/version
// for the environment info header.

export interface DashboardContainers {
  total: number; running: number; stopped: number;
  healthy: number; unhealthy: number;
}

/** UNAXIS extension — not part of Portainer's dashboardResponse */
export interface DashboardInfo {
  dockerVersion: string; apiVersion: string;
  cpu: number; memory: number;
  swarm: boolean; os: string; kernel: string;
}

export interface DashboardResponse {
  // ── Portainer-spec fields ───────────────────────────────────────────
  containers: DashboardContainers;
  services:   number;
  images:     { total: number; size: number };
  volumes:    number;
  networks:   number;
  stacks:     number;
  // ── UNAXIS extension ────────────────────────────────────────────────
  info:       DashboardInfo;
}

// ── Health ping ───────────────────────────────────────────────────────────────

/**
 * Ping an environment's agent /health endpoint.
 * Returns AgentHealthResult compatible with environment-store.pingAgentHealth().
 */
export async function pingAgent(env: UnaxisEnvironment): Promise<AgentHealthResult> {
  const base = env.agentUrl.replace(/\/$/, "");
  if (!base) return { online: false, version: "", detail: "agent_url not configured" };

  try {
    const sigHdr = await buildSignatureHeaders();
    const res = await fetch(`${base}/health`, {
      headers: sigHdr,
      signal:  AbortSignal.timeout(5_000),
    });

    if (!res.ok) return { online: false, version: "", detail: `HTTP ${res.status}` };

    const json = (await res.json()) as { version?: string; status?: string } | null;
    return { online: true, version: json?.version ?? "", detail: "ok" };
  } catch (err) {
    return {
      online:  false,
      version: "",
      detail:  err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Dashboard aggregator fetch ────────────────────────────────────────────────

/**
 * Fetch the aggregated dashboard from the agent's single endpoint.
 * Mirrors: GET /api/endpoints/{id}/docker/dashboard in Portainer.
 *
 * One signed request → agent aggregates containers/images/volumes/networks/
 * info/stacks internally (handler/docker/dashboard.js) and returns a single
 * DashboardResponse JSON.
 *
 * Returns null on any error — callers should surface a retry hint.
 */
export async function fetchDashboard(
  env: UnaxisEnvironment,
): Promise<DashboardResponse | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await agentFetch(env, "/docker/dashboard", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as DashboardResponse;
  } catch {
    return null;
  }
}

// ── Resource list types ───────────────────────────────────────────────────────

export interface ContainerSummary {
  Id:      string;
  Names:   string[];
  Image:   string;
  ImageID: string;
  Status:  string;
  State:   string;   // "running" | "exited" | "paused" | "restarting" | "dead" | "created"
  Created: number;   // unix timestamp — mirrors containers.go Created field
  Mounts:  { Name?: string; Type: string }[];
  Labels:  Record<string, string>;
  Ports:   { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
  // NetworkSettings is present in /containers/json when NetworkMode is set
  NetworkSettings?: {
    Networks?: Record<string, { IPAddress?: string; GlobalIPv6Address?: string }>;
  };
}

/** Raw inspect response — full container detail. Typed as unknown; callers display as JSON. */
export type ContainerInspect = Record<string, unknown>;

// ── Container create spec ─────────────────────────────────────────────────────
// Mirrors the body sent to POST /containers/create (Docker Engine API)

export interface PortBinding {
  hostIp?:   string;
  hostPort:  string;
}

export interface ContainerCreateSpec {
  name:   string;
  image:  string;
  ports:  { container: string; host: string; protocol: "tcp" | "udp" }[];
  env:    string[];   // "KEY=value" pairs
  cmd?:   string[];
  labels: Record<string, string>;
  restartPolicy: "no" | "always" | "unless-stopped" | "on-failure";
}

export interface ImageSummary {
  Id:          string;   // "sha256:abc..."
  RepoTags:    string[] | null;
  RepoDigests: string[] | null;
  Size:        number;
  Created:     number;   // unix timestamp
  Labels:      Record<string, string> | null;
}

export interface VolumeSummary {
  Name:       string;
  Driver:     string;
  Mountpoint: string;
  Labels:     Record<string, string> | null;
  Scope:      string;
  CreatedAt:  string;
  // Appended by fetchVolumes after two-call dangling detection (mirrors Portainer images_list.go)
  dangling:   boolean;
}

export interface VolumesListResponse {
  Volumes:  VolumeSummary[];
  Warnings: string[];
}

export interface NetworkIPAMConfig {
  Subnet?:  string;
  Gateway?: string;
}

export interface NetworkSummary {
  Id:         string;
  Name:       string;
  Driver:     string;
  Scope:      string;
  Attachable: boolean;
  Internal:   boolean;
  IPAM:       { Driver: string; Config: NetworkIPAMConfig[] };
  Labels:     Record<string, string> | null;
  Containers: Record<string, unknown> | null;
}

// ── Resource list fetchers ────────────────────────────────────────────────────

/** Fetch all containers (running + stopped). */
export async function fetchContainers(
  env: UnaxisEnvironment,
): Promise<ContainerSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/containers/json?all=1", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ContainerSummary[];
  } catch {
    return null;
  }
}

/** Fetch all images. */
export async function fetchImages(
  env: UnaxisEnvironment,
): Promise<ImageSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/images/json", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ImageSummary[];
  } catch {
    return null;
  }
}

/**
 * Fetch all volumes with dangling detection.
 *
 * Mirrors Portainer's two-call approach (images_list.go imageUsageSet pattern):
 *   1. GET /volumes?filters={"dangling":["false"]}  → in-use volumes
 *   2. GET /volumes?filters={"dangling":["true"]}   → orphaned volumes
 * Both sets are merged and each volume tagged with dangling: true/false.
 * This is more reliable than cross-referencing container mounts manually.
 */
export async function fetchVolumes(
  env: UnaxisEnvironment,
): Promise<VolumeSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const inUseFilter  = encodeURIComponent('{"dangling":["false"]}');
    const danglingFilter = encodeURIComponent('{"dangling":["true"]}');

    const [inUseRes, danglingRes] = await Promise.all([
      dockerFetch(env, `/volumes?filters=${inUseFilter}`,   { signal: AbortSignal.timeout(12_000) }),
      dockerFetch(env, `/volumes?filters=${danglingFilter}`, { signal: AbortSignal.timeout(12_000) }),
    ]);

    const inUse    = inUseRes.ok    ? ((await inUseRes.json())    as VolumesListResponse).Volumes ?? [] : [];
    const dangling = danglingRes.ok ? ((await danglingRes.json()) as VolumesListResponse).Volumes ?? [] : [];

    return [
      ...inUse.map((v)    => ({ ...v, dangling: false })),
      ...dangling.map((v) => ({ ...v, dangling: true })),
    ];
  } catch {
    return null;
  }
}

/** Fetch all networks. */
export async function fetchNetworks(
  env: UnaxisEnvironment,
): Promise<NetworkSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/networks", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as NetworkSummary[];
  } catch {
    return null;
  }
}

// ── Container actions ─────────────────────────────────────────────────────────

type ContainerActionVerb = "start" | "stop" | "restart" | "kill" | "pause" | "resume";

/** Send a lifecycle action (start/stop/restart/kill/pause/resume) to a container. */
export async function containerAction(
  env:    UnaxisEnvironment,
  id:     string,
  action: ContainerActionVerb,
): Promise<boolean> {
  try {
    const res = await dockerFetch(env, `/containers/${id}/${action}`, {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    // 204 No Content = success; 304 = already in desired state (also fine)
    return res.ok || res.status === 304;
  } catch {
    return false;
  }
}

/** Remove (delete) a container. Pass force=true to remove even if running. */
export async function removeContainer(
  env:   UnaxisEnvironment,
  id:    string,
  force = false,
): Promise<boolean> {
  try {
    const qs  = force ? "?force=true" : "";
    const res = await dockerFetch(env, `/containers/${id}${qs}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Remove (untag/delete) an image. */
export async function removeImage(
  env:  UnaxisEnvironment,
  id:   string,
): Promise<boolean> {
  try {
    const res = await dockerFetch(env, `/images/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Remove a volume by name. */
export async function removeVolume(
  env:  UnaxisEnvironment,
  name: string,
): Promise<boolean> {
  try {
    const res = await dockerFetch(env, `/volumes/${encodeURIComponent(name)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Remove a network by ID. */
export async function removeNetwork(
  env: UnaxisEnvironment,
  id:  string,
): Promise<boolean> {
  try {
    const res = await dockerFetch(env, `/networks/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Container stats ───────────────────────────────────────────────────────────
// Mirrors Portainer's containerStatsController.js delta formula exactly.

export interface ContainerStatsRaw {
  cpu_stats: {
    cpu_usage:        { total_usage: number; percpu_usage?: number[] };
    system_cpu_usage: number;
    online_cpus?:     number;
  };
  precpu_stats: {
    cpu_usage:        { total_usage: number };
    system_cpu_usage: number;
  };
  memory_stats: {
    usage:  number;
    limit:  number;
    stats?: { cache?: number };
  };
}

export interface ContainerStats {
  cpuPercent: number;   // 0–100 per core (can exceed 100 on multi-core)
  memUsed:    number;   // bytes (usage minus cache)
  memLimit:   number;   // bytes
  memPercent: number;   // 0–100
}

/**
 * Fetch a one-shot stats snapshot for a container.
 * Uses stream=false so Docker returns a single JSON object immediately.
 * Applies Portainer's exact delta formula for CPU %.
 */
export async function fetchContainerStats(
  env: UnaxisEnvironment,
  id:  string,
): Promise<ContainerStats | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(
      env,
      `/containers/${id}/stats?stream=false`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as ContainerStatsRaw;

    // CPU % — Portainer delta formula (containerStatsController.js)
    const cpuDelta    = raw.cpu_stats.cpu_usage.total_usage
                      - raw.precpu_stats.cpu_usage.total_usage;
    const systemDelta = raw.cpu_stats.system_cpu_usage
                      - raw.precpu_stats.system_cpu_usage;
    const cores       = raw.cpu_stats.online_cpus
                      ?? raw.cpu_stats.cpu_usage.percpu_usage?.length
                      ?? 1;
    const cpuPercent  = systemDelta > 0 && cpuDelta > 0
      ? (cpuDelta / systemDelta) * cores * 100
      : 0;

    // Memory — subtract page cache to match what Portainer shows
    const cache      = raw.memory_stats.stats?.cache ?? 0;
    const memUsed    = Math.max(0, raw.memory_stats.usage - cache);
    const memLimit   = raw.memory_stats.limit;
    const memPercent = memLimit > 0 ? (memUsed / memLimit) * 100 : 0;

    return { cpuPercent, memUsed, memLimit, memPercent };
  } catch {
    return null;
  }
}

// ── Container logs ────────────────────────────────────────────────────────────
// Mirrors Portainer's containerLogsController.js fetch params exactly:
//   stdout=1 stderr=1 timestamps=0 tail=100
//
// Docker multiplexes stdout+stderr with an 8-byte header when TTY=false.
// Portainer strips it with: logs.substring(8).replace(/\r?\n(.{8})/g, '\n')
// We apply the same strip so raw log lines come through cleanly.

/**
 * Fetch the last N log lines for a container.
 * Returns raw text with ANSI codes intact (Ink renders them).
 * Strips Docker's 8-byte multiplex header (as Portainer does).
 */
export async function fetchContainerLogs(
  env:    UnaxisEnvironment,
  id:     string,
  tail = 100,
): Promise<string | null> {
  if (!env.agentUrl) return null;
  try {
    const qs  = `stdout=1&stderr=1&timestamps=0&tail=${tail}`;
    const res = await dockerFetch(env, `/containers/${id}/logs?${qs}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    // Strip Docker 8-byte multiplex header — same regex Portainer uses
    return raw.substring(8).replace(/\r?\n(.{8})/g, "\n");
  } catch {
    return null;
  }
}

// ── Container inspect ─────────────────────────────────────────────────────────
// Mirrors: Portainer containerController.js inspectContainer()
// GET /containers/{id}/json — full container detail

export async function inspectContainer(
  env: UnaxisEnvironment,
  id:  string,
): Promise<ContainerInspect | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, `/containers/${id}/json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ContainerInspect;
  } catch {
    return null;
  }
}

// ── Container create ──────────────────────────────────────────────────────────
// Mirrors: Portainer createContainerController.js
// Two-step: POST /containers/create  →  POST /containers/{id}/start

export async function createContainer(
  env:  UnaxisEnvironment,
  spec: ContainerCreateSpec,
): Promise<{ Id: string } | null> {
  if (!env.agentUrl) return null;
  try {
    // Build ExposedPorts + PortBindings (Docker API format)
    const ExposedPorts: Record<string, object> = {};
    const PortBindings: Record<string, { HostIp: string; HostPort: string }[]> = {};
    for (const { container, host, protocol } of spec.ports) {
      const key = `${container}/${protocol}`;
      ExposedPorts[key] = {};
      PortBindings[key] = [{ HostIp: "0.0.0.0", HostPort: host }];
    }

    const body = JSON.stringify({
      name:         undefined,   // name goes in query string
      Image:        spec.image,
      Env:          spec.env,
      Cmd:          spec.cmd ?? undefined,
      Labels:       spec.labels,
      ExposedPorts,
      HostConfig: {
        PortBindings,
        RestartPolicy: { Name: spec.restartPolicy },
      },
    });

    const createRes = await dockerFetch(
      env,
      `/containers/create?name=${encodeURIComponent(spec.name)}`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal:  AbortSignal.timeout(15_000),
      },
    );
    if (!createRes.ok) return null;
    const created = (await createRes.json()) as { Id: string };

    // Start the container
    await dockerFetch(env, `/containers/${created.Id}/start`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });

    return created;
  } catch {
    return null;
  }
}

// ── Volume create ─────────────────────────────────────────────────────────────
// Mirrors: Portainer volumeController.js createVolume()
// POST /volumes/create

export async function createVolume(
  env:     UnaxisEnvironment,
  name:    string,
  driver = "local",
  labels:  Record<string, string> = {},
): Promise<VolumeSummary | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/volumes/create", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ Name: name, Driver: driver, Labels: labels }),
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const vol = (await res.json()) as VolumeSummary;
    return { ...vol, dangling: true }; // brand-new volume has no containers yet
  } catch {
    return null;
  }
}

// ── Network create ────────────────────────────────────────────────────────────
// Mirrors: Portainer networkController.js createNetwork()
// POST /networks/create

export interface NetworkCreateSpec {
  name:       string;
  driver:     string;             // "bridge" | "overlay" | "macvlan" | "host" | "none"
  internal?:  boolean;
  attachable?: boolean;
  subnet?:    string;             // e.g. "192.168.10.0/24"
  gateway?:   string;             // e.g. "192.168.10.1"
  ipv6?:      boolean;
  labels?:    Record<string, string>;
}

export async function createNetwork(
  env:  UnaxisEnvironment,
  spec: NetworkCreateSpec,
): Promise<{ Id: string } | null> {
  if (!env.agentUrl) return null;
  try {
    const ipamConfig: { Subnet?: string; Gateway?: string }[] = [];
    if (spec.subnet || spec.gateway) {
      ipamConfig.push({ Subnet: spec.subnet, Gateway: spec.gateway });
    }

    const res = await dockerFetch(env, "/networks/create", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        Name:       spec.name,
        Driver:     spec.driver,
        Internal:   spec.internal  ?? false,
        Attachable: spec.attachable ?? false,
        EnableIPv6: spec.ipv6      ?? false,
        IPAM:       { Driver: "default", Config: ipamConfig },
        Labels:     spec.labels    ?? {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { Id: string };
  } catch {
    return null;
  }
}

// ── Image pull ────────────────────────────────────────────────────────────────
// Mirrors: Portainer imageController.js pullImage()
// POST /images/create?fromImage={image}:{tag}
//
// NOTE: embed the tag directly in fromImage ("image:tag") rather than using a
// separate &tag= parameter.  Docker returns "invalid tag format" 400 when the
// image reference contains a registry hostname (ghcr.io/...) and the tag is
// supplied via the separate query param — the two-param form is only reliable
// for Docker Hub short names.  The "name may include a tag" form is what the
// Docker CLI itself sends for fully-qualified references.
//
// Also do NOT use encodeURIComponent here — the agent's proxy already decodes
// percent-encoded slashes before forwarding to Docker.
export async function pullImage(
  env:    UnaxisEnvironment,
  image:  string,
  tag:    string,
  onLine: (line: string) => void,
): Promise<boolean> {
  if (!env.agentUrl) return false;
  try {
    const ref = tag ? `${image}:${tag}` : image;
    const res = await dockerFetch(
      env,
      `/images/create?fromImage=${ref}`,
      { method: "POST", signal: AbortSignal.timeout(120_000) },
    );
    if (!res.ok) {
      onLine(`✗ HTTP ${res.status}`);
      return false;
    }
    // Docker streams newline-delimited JSON progress events
    const text = await res.text();
    for (const chunk of text.split("\n").filter(Boolean)) {
      try {
        const evt = JSON.parse(chunk) as { status?: string; error?: string; progressDetail?: unknown; id?: string };
        if (evt.error) { onLine(`✗ ${evt.error}`); return false; }
        if (evt.status && !evt.progressDetail) {
          onLine(evt.id ? `  [${evt.id}] ${evt.status}` : `  ${evt.status}`);
        }
      } catch {
        onLine(`  ${chunk}`);
      }
    }
    return true;
  } catch (err) {
    onLine(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// ── Stack deploy ──────────────────────────────────────────────────────────────
// POST /stacks/deploy  { name, yaml }
// Agent runs: docker compose -f /tmp/.../docker-compose.yml -p name up -d
// Returns { ok, logs } — streams output via onLine callback.

export async function deployStack(
  env:    UnaxisEnvironment,
  name:   string,
  yaml:   string,
  onLine: (line: string) => void,
): Promise<boolean> {
  if (!env.agentUrl) return false;
  try {
    const res = await agentFetch(env, "/stacks/deploy", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name, yaml }),
      signal:  AbortSignal.timeout(120_000),
    });
    const data = (await res.json()) as { ok: boolean; logs?: string; error?: string; code?: number };
    const logText = data.logs ?? data.error ?? "";
    for (const line of logText.split("\n").filter(Boolean)) {
      onLine(line);
    }
    return data.ok === true;
  } catch (err) {
    onLine(`✗ ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
