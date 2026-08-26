// src/ink/environment-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP: environment records from the local SQLite control-plane DB.
//
// An "environment" is the full set of infrastructure coordinates for one
// infrastructure node — analogous to a Portainer Endpoint.  It is NOT a zone
// (zones are app deployments).
//
// ── Conceptual model ──────────────────────────────────────────────────────────
// ALL registered environments are live infrastructure nodes running simultaneously.
// There is no "one globally active environment."
//
//   active            — DEPRECATED.  Kept for compat.  Do not use in new code.
//   is_default_target — The node the wizard pre-selects for new zone deploys.
//                       Only one may be true, but all envs are always live.
//
// This store owns:
//   ✓  Loading / caching the environments list from SQLite control-db
//   ✓  Switching the wizard default target (is_default_target, atomic transaction)
//   ✓  Fetching decrypted credentials on demand from vault.decrypted_secrets
//       (vault still lives in Supabase — secret values cannot be in plaintext SQLite)
//   ✓  Pinging agent /health and persisting agent_status / agent_last_seen_at
//   ✗  Zone definitions — that is zone-store.ts
//   ✗  Docker polling — that is docker.ts / useZoneManager
//   ✗  Infra health checks — that is infra.ts / useEnvManager
//
// Callers must never pass raw secret values through this store.
// Only Vault secret IDs (UUIDs) live on the environment row.
// ─────────────────────────────────────────────────────────────────────────────

import {
  dbGetEnvironments,
  dbGetEnvironmentById,
  dbUpsertEnvironment,
  dbUpdateAgentStatus,
  dbUpdateEnvironmentStatus,
  dbSetDefaultTarget,
} from "./control-db.ts";
import { existsSync, readFileSync } from "fs";
import { homedir }                  from "os";
import { join }                     from "path";
import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../utils/runtimeEnv.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Environment type — maps to Portainer EndpointType.
 * The numeric values are intentionally kept compatible so the legacy
 * Portainer layer (src/legacy/portainer/api/portainer.ts) can interop.
 *
 *   local-docker  = DockerEnvironment (1)
 *   remote-docker = AgentOnDockerEnvironment (2)
 *   azure         = AzureEnvironment (3)
 *   edge          = EdgeAgentOnDockerEnvironment (4)
 */
export type EnvironmentType =
  | "local-docker"
  | "remote-docker"
  | "azure"
  | "edge";

export type EnvironmentStatus = "up" | "down" | "unknown";

/** Agent health states — result of pinging GET <agent_url>/health */
export type AgentStatus = "online" | "offline" | "unknown";

/** Public (non-secret) shape of an environment record. */
export interface UnaxisEnvironment {
  id:           string;
  name:         string;
  type:         EnvironmentType;
  status:       EnvironmentStatus;

  /**
   * @deprecated Use isDefaultTarget instead.
   * Kept for backward compat — do not add new code that reads this.
   * All environments are live infrastructure nodes regardless of this flag.
   */
  active:           boolean;
  /** True if this environment is the wizard's pre-selected deploy target. */
  isDefaultTarget:  boolean;

  // Docker endpoint connection
  /** Direct Docker socket/TCP URL — used when no agent is present. */
  dockerUrl:    string;   // e.g. unix:///var/run/docker.sock  or  tcp://<HOST>:2375
  machineRole:  string;   // e.g. "NPM · Mail · AI"  or  "App · DB · Proxy · Zones"

  // ── UNAXIS agent ──────────────────────────────────────────────────────────
  /** Base URL of the unaxis/agent API — "" if not configured. */
  agentUrl:          string;   // e.g. http://192.168.x.x:8888
  agentPort:         number;   // default 8001
  agentStatus:       AgentStatus;
  agentLastSeenAt:   string | null;  // ISO timestamp or null
  agentVersion:      string;   // reported by /health, "" if unknown
  agentTokenSecretId: string | null; // vault ref for bearer token

  // Connection coordinates
  npmHost:      string;
  npmPort:      number;
  proxyHost:    string;
  proxyPort:    number;
  domain:       string;
  ddnsHostname: string;
  publicUrl:    string;

  // TLS config (paths only)
  tlsConfig: {
    tls:               boolean;
    skipVerify:        boolean;
    skipClientVerify:  boolean;
    caCertPath:        string;
    certPath:          string;
    keyPath:           string;
  };

  // Vault secret reference IDs (null = not configured)
  npmSecretId:             string | null;
  azureAppIdSecretId:      string | null;
  azureTenantIdSecretId:   string | null;
  azureAuthKeySecretId:    string | null;

  tags:       string[];
  sortOrder:  number;
  createdAt:  string;
  updatedAt:  string;
}

/** Decrypted credentials for an environment — fetched on demand from Vault. */
export interface EnvironmentCredentials {
  npmPassword:          string | null;
  azureApplicationId:   string | null;
  azureTenantId:        string | null;
  azureAuthKey:         string | null;
}

// ── In-memory cache ───────────────────────────────────────────────────────────
// SQLite reads are sub-millisecond but we keep a short TTL to avoid tight-loop
// re-reads in the render cycle (e.g. useEnvManager polling at 5 s intervals).

let _cache:      UnaxisEnvironment[] | null = null;
let _fetchedAt   = 0;
const CACHE_TTL_MS = 5_000;

export let lastEnvironmentError: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function dbg(msg: string) {
  if (process.env["UNAXIS_DEBUG"]) {
    process.stderr.write("[environment-store] " + msg + "\n");
  }
}

function buildVaultHeaders(): Record<string, string> {
  const serviceKey = getRuntimeServiceKey();
  return {
    "Authorization": "Bearer " + serviceKey,
    "apikey":        serviceKey,
    "Accept":        "application/json",
    "Content-Type":  "application/json",
  };
}

/** Vault decrypted_secrets row (PostgREST) */
interface DecryptedSecretRow {
  id:               string;
  decrypted_secret: string | null;
}

// ── Auto-seed ─────────────────────────────────────────────────────────────────

/**
 * If the control-db is brand new (no environments), seed a default LOCAL
 * environment from the local unaxis config file so first-boot works without
 * a manual `unaxis db migrate-control` run.
 */
function autoSeedLocalEnvironment(): UnaxisEnvironment {
  dbg("Auto-seeding local 'LOCAL' environment into SQLite (first boot).");

  let localConfig: any = null;
  try {
    const appData  = process.env["APPDATA"] ?? join(homedir(), ".config");
    const cfgPath  = join(appData, "unaxis", "unenter", "config.json");
    if (existsSync(cfgPath)) {
      localConfig = JSON.parse(readFileSync(cfgPath, "utf-8"));
    }
  } catch (e) {
    dbg("Could not read local config for auto-seed: " + e);
  }

  const domain      = localConfig?.domain          ?? "unenter.live";
  const npmIp       = localConfig?.npm?.ip          ?? "127.0.0.1";
  const npmPort     = localConfig?.npm?.port         ?? 81;
  const stackIp     = localConfig?.stack?.ip         ?? "127.0.0.1";
  const proxyPort   = localConfig?.stack?.proxyPort  ?? 3080;
  const ddnsHostname = localConfig?.ddns?.hostname   ?? "";

  const env: UnaxisEnvironment = {
    // Use a real UUID so this row never collides with a migrated record.
    // The dedup command (unaxis db dedup-environments) merges if needed.
    id:              crypto.randomUUID(),
    name:            "LOCAL",
    type:            "local-docker",
    status:          "unknown",
    active:          true,
    isDefaultTarget: true,
    dockerUrl:       "unix:///var/run/docker.sock",
    machineRole:     "App · DB · Proxy · Zones",
    agentUrl:        "http://127.0.0.1:8888",
    agentPort:       8888,
    agentStatus:     "unknown",
    agentLastSeenAt: null,
    agentVersion:    "",
    agentTokenSecretId: null,
    npmHost:         npmIp,
    npmPort,
    proxyHost:       stackIp,
    proxyPort,
    domain,
    ddnsHostname,
    publicUrl:       "https://" + domain,
    tlsConfig: { tls: false, keyPath: "", certPath: "", caCertPath: "", skipVerify: false, skipClientVerify: false },
    npmSecretId:             null,
    azureAppIdSecretId:      null,
    azureTenantIdSecretId:   null,
    azureAuthKeySecretId:    null,
    tags:       [],
    sortOrder:  0,
    createdAt:  new Date().toISOString(),
    updatedAt:  new Date().toISOString(),
  };

  try {
    dbUpsertEnvironment(env);
    dbg("Auto-seeded LOCAL environment into SQLite.");
  } catch (err) {
    dbg("Auto-seed upsert failed: " + err);
  }

  return env;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load all environments from the local SQLite control-db, sorted by sort_order.
 * Results cached for CACHE_TTL_MS. Pass force=true to bypass cache.
 *
 * Never fails — returns [] if the DB is empty (run `unaxis db migrate-control`
 * to import from Supabase, or the auto-seed path handles first boot).
 */
export async function loadEnvironments(force = false): Promise<UnaxisEnvironment[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    dbg("returning cached environments (" + _cache.length + ")");
    return _cache;
  }

  try {
    let envs = dbGetEnvironments();
    dbg("loaded " + envs.length + " environments from SQLite");

    // First-boot: DB is empty — seed a sensible default so the TUI is usable
    // immediately without requiring a manual migration command.
    if (envs.length === 0) {
      const seeded = autoSeedLocalEnvironment();
      envs = [seeded];
    }

    lastEnvironmentError = null;
    _cache     = envs;
    _fetchedAt = Date.now();
    return _cache;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbg("SQLite error: " + msg);
    lastEnvironmentError = msg;
    return _cache ?? [];
  }
}

/**
 * @deprecated Use getDefaultTarget() instead.
 * Return the environment with active=true (legacy compat).
 * All environments are live nodes — "active" only means wizard default.
 */
export async function getActiveEnvironment(): Promise<UnaxisEnvironment | null> {
  const all = await loadEnvironments();
  return all.find((e) => e.active) ?? null;
}

/**
 * Return the environment flagged as the wizard's default deploy target.
 * Returns null if none is set or the list is empty.
 * Does NOT mean other environments are inactive — all envs are live nodes.
 */
export async function getDefaultTarget(): Promise<UnaxisEnvironment | null> {
  const all = await loadEnvironments();
  return all.find((e) => e.isDefaultTarget) ?? all[0] ?? null;
}

// ── Agent health ──────────────────────────────────────────────────────────────

export interface AgentHealthResult {
  online:  boolean;
  version: string;
  detail:  string;
}

/**
 * Ping an environment's agent GET /health endpoint.
 * Timeout: 5 s.  Does NOT write to SQLite — call saveAgentStatus() for that.
 *
 * Delegates to agent-client.ts pingAgent() which handles token resolution
 * (env var override → Vault lookup) before making the /health request.
 */
export async function pingAgentHealth(env: UnaxisEnvironment): Promise<AgentHealthResult> {
  const { pingAgent } = await import("./agent-client.ts");
  return pingAgent(env);
}

/**
 * Persist agent status to SQLite after a health ping.
 * Updates agent_status, agent_last_seen_at, agent_version on the DB row.
 * Busts the in-memory cache so the next loadEnvironments() reflects reality.
 */
export async function saveAgentStatus(
  envId:  string,
  result: AgentHealthResult,
): Promise<void> {
  const agentStatus: AgentStatus = result.online ? "online" : "offline";
  const lastSeenAt = result.online ? new Date().toISOString() : null;

  try {
    dbUpdateAgentStatus(envId, agentStatus, result.version, lastSeenAt);
    dbg("saved agent status " + agentStatus + " for env " + envId);
  } catch (err) {
    dbg("saveAgentStatus error: " + (err instanceof Error ? err.message : String(err)));
  }

  // Bust cache so next read reflects the new status.
  _cache = null;
}

/**
 * Switch the default deploy target — atomic SQLite transaction.
 * Clears is_default_target on all rows, sets it on the target id.
 *
 * Returns the newly default environment, or null if not found.
 */
export async function setActiveEnvironment(id: string): Promise<UnaxisEnvironment | null> {
  try {
    dbSetDefaultTarget(id);
    dbg("set default target → " + id);
    invalidateEnvironmentCache();
    const env = dbGetEnvironmentById(id);
    return env;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    dbg("setActiveEnvironment error: " + msg);
    lastEnvironmentError = msg;
    return null;
  }
}

/**
 * Fetch decrypted credentials for an environment from vault.decrypted_secrets.
 *
 * NOTE: This is the ONE function that still calls Supabase — secret values
 * cannot be stored in plaintext SQLite. The environment row carries only the
 * vault secret IDs; the actual decryption happens server-side in Supabase.
 *
 * Only fetches secrets that have a non-null secret ID in the environment record.
 * Called on demand — not on every poll.
 */
export async function getActiveEnvironmentCredentials(
  env: UnaxisEnvironment
): Promise<EnvironmentCredentials> {
  const result: EnvironmentCredentials = {
    npmPassword:        null,
    azureApplicationId: null,
    azureTenantId:      null,
    azureAuthKey:       null,
  };

  const secretIds = [
    env.npmSecretId,
    env.azureAppIdSecretId,
    env.azureTenantIdSecretId,
    env.azureAuthKeySecretId,
  ].filter(Boolean);

  if (secretIds.length === 0) return result;
  if (typeof fetch === "undefined") return result;

  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = buildVaultHeaders();
  const serviceKey = getRuntimeServiceKey();

  if (!serviceKey) {
    dbg("no SERVICE_ROLE_KEY — cannot fetch vault credentials");
    return result;
  }

  const filter  = secretIds.map((id) => "id.eq." + id).join(",");
  const url     = kongUrl + "/rest/v1/vault_decrypted_secrets?or=(" + encodeURIComponent(filter) + ")&select=id,decrypted_secret";

  dbg("fetching credentials from vault, ids: " + secretIds.join(", "));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return result;

    const rows = await res.json() as DecryptedSecretRow[];
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.decrypted_secret]));

    if (env.npmSecretId)           result.npmPassword        = byId[env.npmSecretId]           ?? null;
    if (env.azureAppIdSecretId)    result.azureApplicationId = byId[env.azureAppIdSecretId]    ?? null;
    if (env.azureTenantIdSecretId) result.azureTenantId      = byId[env.azureTenantIdSecretId] ?? null;
    if (env.azureAuthKeySecretId)  result.azureAuthKey       = byId[env.azureAuthKeySecretId]  ?? null;

  } catch (err) {
    clearTimeout(timer);
    dbg("credentials fetch error: " + (err instanceof Error ? err.message : String(err)));
  }

  return result;
}

/**
 * Create a new environment record in SQLite.
 * Only `name`, `type`, `agent_url`, and `agent_port` are required.
 * Throws on failure so callers can surface errors in the TUI.
 */
export async function createEnvironment(payload: {
  name:       string;
  type?:      EnvironmentType;
  agent_url:  string;
  agent_port: number;
  [key: string]: unknown;
}): Promise<UnaxisEnvironment> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const env: UnaxisEnvironment = {
    id,
    name:            payload.name,
    type:            (payload.type as EnvironmentType) ?? "remote-docker",
    status:          "unknown",
    active:          false,
    isDefaultTarget: false,
    dockerUrl:       (payload.docker_url as string)    ?? "",
    machineRole:     (payload.machine_role as string)  ?? "",
    agentUrl:        payload.agent_url,
    agentPort:       payload.agent_port,
    agentStatus:     "unknown",
    agentLastSeenAt: null,
    agentVersion:    "",
    agentTokenSecretId: null,
    npmHost:         (payload.npm_host as string)      ?? "",
    npmPort:         (payload.npm_port as number)      ?? 81,
    proxyHost:       (payload.proxy_host as string)    ?? "",
    proxyPort:       (payload.proxy_port as number)    ?? 3080,
    domain:          (payload.domain as string)        ?? "",
    ddnsHostname:    (payload.ddns_hostname as string) ?? "",
    publicUrl:       (payload.public_url as string)    ?? "",
    tlsConfig: {
      tls: false, keyPath: "", certPath: "", caCertPath: "",
      skipVerify: false, skipClientVerify: false,
    },
    npmSecretId:            null,
    azureAppIdSecretId:     null,
    azureTenantIdSecretId:  null,
    azureAuthKeySecretId:   null,
    tags:      [],
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  dbUpsertEnvironment(env);
  dbg("created environment " + env.name + " (" + id + ")");
  invalidateEnvironmentCache();
  return env;
}

/**
 * Update the status of an environment (called by the infra health checker).
 * Updates the SQLite row and optimistically updates the in-memory cache entry.
 */
export async function updateEnvironmentStatus(
  id: string,
  status: EnvironmentStatus
): Promise<void> {
  // Optimistic in-memory update
  if (_cache) {
    for (const e of _cache) {
      if (e.id === id) { e.status = status; break; }
    }
  }

  try {
    dbUpdateEnvironmentStatus(id, status);
    dbg("updated environment status " + status + " for " + id);
  } catch {
    // Status update is best-effort — don't surface errors
  }
}

/** Bust the cache (e.g. after switching or creating an environment). */
export function invalidateEnvironmentCache(): void {
  _cache     = null;
  _fetchedAt = 0;
}

/**
 * Returns the Unix timestamp (ms) of the last SUCCESSFUL load from SQLite.
 * Returns 0 if environments have never been loaded successfully.
 * Used by useEnvManager to compute data age and decide whether to show a stale banner.
 */
export function getLastEnvironmentFetchTime(): number {
  return _fetchedAt;
}

/**
 * Returns the current error message from the last failed environment load,
 * or null if the last load succeeded.
 */
export function getLastEnvironmentError(): string | null {
  return lastEnvironmentError;
}

/**
 * Type-guard helpers — mirror the Portainer helper functions
 * (isEdgeEndpoint, isAzureEndpoint, etc.) from the legacy layer.
 */
export function isAzureEnvironment(env: Pick<UnaxisEnvironment, "type">): boolean {
  return env.type === "azure";
}

export function isEdgeEnvironment(env: Pick<UnaxisEnvironment, "type">): boolean {
  return env.type === "edge";
}

export function isLocalEnvironment(env: Pick<UnaxisEnvironment, "type">): boolean {
  return env.type === "local-docker";
}

export function isRemoteEnvironment(env: Pick<UnaxisEnvironment, "type">): boolean {
  return env.type === "remote-docker" || env.type === "edge";
}

/** Display color for each environment type — used in TUI and IPC output. */
export function environmentTypeColor(type: EnvironmentType): string {
  switch (type) {
    case "local-docker":  return "green";
    case "remote-docker": return "yellow";
    case "azure":         return "blue";
    case "edge":          return "magenta";
  }
}

/** Short type label for IPC line output. */
export function environmentTypeLabel(type: EnvironmentType): string {
  switch (type) {
    case "local-docker":  return "local-docker";
    case "remote-docker": return "remote-docker";
    case "azure":         return "azure";
    case "edge":          return "edge";
  }
}
