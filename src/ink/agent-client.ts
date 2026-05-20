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
 * path should be the Docker API path, e.g. "/v1.43/containers/json".
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
  Mounts:  { Name?: string; Type: string }[];
  Labels:  Record<string, string>;
  Ports:   { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
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
  IPAM:       { Driver: string; Config: NetworkIPAMConfig[] };
  Labels:     Record<string, string> | null;
  Containers: Record<string, unknown> | null;
  Internal:   boolean;
}

// ── Resource list fetchers ────────────────────────────────────────────────────

/** Fetch all containers (running + stopped). */
export async function fetchContainers(
  env: UnaxisEnvironment,
): Promise<ContainerSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/v1.43/containers/json?all=1", {
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
    const res = await dockerFetch(env, "/v1.43/images/json", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ImageSummary[];
  } catch {
    return null;
  }
}

/** Fetch all volumes. */
export async function fetchVolumes(
  env: UnaxisEnvironment,
): Promise<VolumeSummary[] | null> {
  if (!env.agentUrl) return null;
  try {
    const res = await dockerFetch(env, "/v1.43/volumes", {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as VolumesListResponse;
    return body.Volumes ?? [];
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
    const res = await dockerFetch(env, "/v1.43/networks", {
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
    const res = await dockerFetch(env, `/v1.43/containers/${id}/${action}`, {
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
    const res = await dockerFetch(env, `/v1.43/containers/${id}${qs}`, {
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
    const res = await dockerFetch(env, `/v1.43/images/${encodeURIComponent(id)}`, {
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
    const res = await dockerFetch(env, `/v1.43/volumes/${encodeURIComponent(name)}`, {
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
    const res = await dockerFetch(env, `/v1.43/networks/${id}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
