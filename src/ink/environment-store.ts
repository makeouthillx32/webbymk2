// src/ink/environment-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP: environment records from Supabase (public.environments).
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
//   ✓  Loading / caching the environments list from Supabase
//   ✓  Switching the wizard default target (is_default_target, enforced by DB)
//   ✓  Fetching decrypted credentials on demand from vault.decrypted_secrets
//   ✓  Pinging agent /health and persisting agent_status / agent_last_seen_at
//   ✗  Zone definitions — that is zone-store.ts
//   ✗  Docker polling — that is docker.ts / useZoneManager
//   ✗  Infra health checks — that is infra.ts / useEnvManager
//
// Callers must never pass raw secret values through this store.
// Only Vault secret IDs (UUIDs) live on the environment row.
//
// Fallback: if Supabase is unreachable the TUI stays functional.
// The last cached list is returned on blips; lastEnvironmentError is set
// so the TUI can surface the problem.  Callers that get a fallback result
// should treat it as "last known good", not authoritative current state.
// ─────────────────────────────────────────────────────────────────────────────

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
  // The unaxis/agent runs on each infrastructure node and exposes a REST API
  // for Docker management.  Once an agent is configured, zone deploys target
  // it instead of using dockerUrl directly.
  //
  // Install command:
  //   docker run -d -p 8001:8001 --name unaxis_agent --restart=always \
  //     -v /var/run/docker.sock:/var/run/docker.sock \
  //     -v /var/lib/docker/volumes:/var/lib/docker/volumes \
  //     -v /:/host  unaxis/agent:latest

  /** Base URL of the unaxis/agent API — "" if not configured. */
  agentUrl:          string;   // e.g. http://192.168.50.75:8001
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

/** Decrypted credentials for an environment — fetched on demand. */
export interface EnvironmentCredentials {
  npmPassword:          string | null;
  azureApplicationId:   string | null;
  azureTenantId:        string | null;
  azureAuthKey:         string | null;
}

// ── DB row shape (PostgREST snake_case) ───────────────────────────────────────

interface EnvironmentRow {
  id:                         string;
  name:                       string;
  type:                       EnvironmentType;
  status:                     EnvironmentStatus;
  active:                     boolean;
  is_default_target:          boolean;
  docker_url:                 string;
  machine_role:               string;
  // Agent metadata
  agent_url:                  string;
  agent_port:                 number;
  agent_status:               AgentStatus;
  agent_last_seen_at:         string | null;
  agent_version:              string;
  agent_token_secret_id:      string | null;
  // Connection coordinates
  npm_host:                   string;
  npm_port:                   number;
  proxy_host:                 string;
  proxy_port:                 number;
  domain:                     string;
  ddns_hostname:              string;
  public_url:                 string;
  tls_config:                 UnaxisEnvironment["tlsConfig"];
  npm_secret_id:              string | null;
  azure_app_id_secret_id:     string | null;
  azure_tenant_id_secret_id:  string | null;
  azure_auth_key_secret_id:   string | null;
  tags:                       string[];
  sort_order:                 number;
  created_at:                 string;
  updated_at:                 string;
}

/** Vault decrypted_secrets row (PostgREST) */
interface DecryptedSecretRow {
  id:               string;
  decrypted_secret: string | null;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _cache:      UnaxisEnvironment[] | null = null;
let _fetchedAt   = 0;
const CACHE_TTL_MS = 60_000;  // re-fetch after 1 minute

export let lastEnvironmentError: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowToEnvironment(r: EnvironmentRow): UnaxisEnvironment {
  return {
    id:              r.id,
    name:            r.name,
    type:            r.type,
    status:          r.status,
    active:          r.active,
    isDefaultTarget: r.is_default_target ?? r.active, // fallback for rows before migration
    dockerUrl:       r.docker_url,
    machineRole:     r.machine_role,
    agentUrl:           r.agent_url          ?? "",
    agentPort:          r.agent_port         ?? 8001,
    agentStatus:        r.agent_status       ?? "unknown",
    agentLastSeenAt:    r.agent_last_seen_at ?? null,
    agentVersion:       r.agent_version      ?? "",
    agentTokenSecretId: r.agent_token_secret_id ?? null,
    npmHost:      r.npm_host,
    npmPort:      r.npm_port,
    proxyHost:    r.proxy_host,
    proxyPort:    r.proxy_port,
    domain:       r.domain,
    ddnsHostname: r.ddns_hostname,
    publicUrl:    r.public_url,
    tlsConfig:    r.tls_config,
    npmSecretId:            r.npm_secret_id,
    azureAppIdSecretId:     r.azure_app_id_secret_id,
    azureTenantIdSecretId:  r.azure_tenant_id_secret_id,
    azureAuthKeySecretId:   r.azure_auth_key_secret_id,
    tags:      r.tags,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function dbg(msg: string) {
  if (process.env.UNAXIS_DEBUG) {
    process.stderr.write("[environment-store] " + msg + "\n");
  }
}

function buildHeaders(): Record<string, string> {
  const serviceKey = getRuntimeServiceKey();
  return {
    "Authorization": "Bearer " + serviceKey,
    "apikey":        serviceKey,
    "Accept":        "application/json",
    "Content-Type":  "application/json",
  };
}

async function autoSeedLocalEnvironment(kongUrl: string, serviceKey: string): Promise<UnaxisEnvironment[]> {
  dbg("Auto-seeding local 'POWER' environment because Supabase environments list is empty.");
  
  let localConfig: any = null;
  try {
    const { join } = await import("path");
    const { homedir } = await import("os");
    const { readFileSync, existsSync } = await import("fs");
    const appData = process.env["APPDATA"] ?? join(homedir(), ".config");
    const configPath = join(appData, "unaxis", "unenter", "config.json");
    if (existsSync(configPath)) {
      localConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    dbg("Could not read local config for auto-seeding: " + e);
  }

  const domain = localConfig?.domain ?? "unenter.live";
  const npmIp = localConfig?.npm?.ip ?? "127.0.0.1";
  const npmPort = localConfig?.npm?.port ?? 81;
  const stackIp = localConfig?.stack?.ip ?? "127.0.0.1";
  const proxyPort = localConfig?.stack?.proxyPort ?? 3080;
  const ddnsHostname = localConfig?.ddns?.hostname ?? "";

  const payload = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "POWER",
    type: "local-docker",
    status: "unknown",
    active: true,
    is_default_target: true,
    docker_url: "unix:///var/run/docker.sock",
    machine_role: "App · DB · Proxy · Zones",
    agent_url: "http://127.0.0.1:8888",
    agent_port: 8888,
    agent_status: "unknown",
    npm_host: npmIp,
    npm_port: npmPort,
    proxy_host: stackIp,
    proxy_port: proxyPort,
    domain: domain,
    ddns_hostname: ddnsHostname,
    public_url: "https://" + domain,
  };

  const headers = {
    "Authorization": "Bearer " + serviceKey,
    "apikey":        serviceKey,
    "Accept":        "application/json",
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
  };

  const url = kongUrl + "/rest/v1/environments";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      dbg("Auto-seed POST failed: " + res.status + " " + text);
      return [];
    }
    const rows = await res.json() as EnvironmentRow[];
    dbg("Auto-seeded successfully: " + (rows[0]?.name ?? "POWER"));
    return rows.map(rowToEnvironment);
  } catch (err) {
    dbg("Auto-seed error: " + err);
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all environments from Supabase, sorted by sort_order.
 * Results cached for CACHE_TTL_MS. Pass force=true to bypass cache.
 *
 * On network failure returns the last cached list (or [] on first boot).
 * lastEnvironmentError is set so the TUI can surface the problem.
 */
export async function loadEnvironments(force = false): Promise<UnaxisEnvironment[]> {
  const now = Date.now();
  if (!force && _cache !== null && now - _fetchedAt < CACHE_TTL_MS) {
    dbg("returning cached environments (" + _cache.length + ")");
    return _cache;
  }

  if (typeof fetch === "undefined") {
    const msg = "global fetch is not available (requires Node.js >= 18). Current: " + process.version;
    dbg("ERROR: " + msg);
    lastEnvironmentError = msg;
    return _cache ?? [];
  }

  const envState   = ensureRuntimeEnv(true);
  const kongUrl    = getRuntimeKongUrl();
  const serviceKey = getRuntimeServiceKey();

  dbg("kongUrl: " + kongUrl);
  dbg("serviceKey set: " + (serviceKey.length > 0 ? "yes" : "NO - empty!"));

  if (!serviceKey) {
    const msg = "SERVICE_ROLE_KEY not loaded from .env at environment fetch time"
      + (envState.projectRoot ? ` (root: ${envState.projectRoot})` : "");
    dbg("ERROR: " + msg);
    lastEnvironmentError = msg;
    return _cache ?? [];
  }

  const url = kongUrl + "/rest/v1/environments?order=sort_order.asc";
  dbg("fetching: " + url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);

  try {
    const res = await fetch(url, {
      headers: buildHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timer);

    dbg("response status: " + res.status);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error("PostgREST " + res.status + ": " + body.slice(0, 200));
    }

    const rows = await res.json() as EnvironmentRow[];
    dbg("rows received: " + rows.length);

    if (rows.length === 0) {
      const seeded = await autoSeedLocalEnvironment(kongUrl, serviceKey);
      if (seeded.length > 0) {
        lastEnvironmentError = null;
        _cache     = seeded;
        _fetchedAt = Date.now();
        return _cache;
      }
    }

    lastEnvironmentError = null;
    _cache     = rows.map(rowToEnvironment);
    _fetchedAt = Date.now();
    return _cache;

  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    dbg("fetch error: " + msg);
    lastEnvironmentError = msg;
    // Return last-known-good cache with an explicit log so callers understand
    // they are not seeing current Supabase state.
    if (_cache !== null) {
      dbg("returning stale cache (" + _cache.length + " envs) after fetch failure");
    } else {
      dbg("no cache available — returning empty list after fetch failure");
    }
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
 * Timeout: 5 s.  Does NOT write to Supabase — call saveAgentStatus() for that.
 *
 * Delegates to agent-client.ts pingAgent() which handles token resolution
 * (env var override → Vault lookup) before making the /health request.
 */
export async function pingAgentHealth(env: UnaxisEnvironment): Promise<AgentHealthResult> {
  const { pingAgent } = await import("./agent-client.ts");
  return pingAgent(env);
}

/**
 * Persist agent status back to Supabase after a health ping.
 * Updates agent_status, agent_last_seen_at, agent_version on the DB row.
 * Also invalidates the local cache so the next loadEnvironments() reflects reality.
 */
export async function saveAgentStatus(
  envId:  string,
  result: AgentHealthResult,
): Promise<void> {
  if (typeof fetch === "undefined") return;
  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = buildHeaders();

  const patch = {
    agent_status:       result.online ? "online" : "offline",
    agent_last_seen_at: result.online ? new Date().toISOString() : undefined,
    agent_version:      result.version || undefined,
  };

  await fetch(
    `${kongUrl}/rest/v1/environments?id=eq.${envId}`,
    { method: "PATCH", headers, body: JSON.stringify(patch) },
  ).catch(() => { /* non-fatal */ });

  // Bust cache so next read reflects the new status.
  _cache = null;
}


/**
 * Switch the active environment.
 * Clears active on all rows, sets active=true on the given id.
 * Uses the partial unique index to enforce single-active atomically.
 *
 * Returns the newly active environment, or null on failure.
 */
/**
 * Switch the active environment — atomic via Postgres RPC.
 *
 * Calls public.switch_active_environment(target_id) which runs both UPDATEs
 * inside PostgREST's implicit transaction.  If the second UPDATE fails the
 * entire transaction rolls back — there is no window where zero environments
 * are active.
 *
 * Migration required: supabase/migrations/20260518_switch_active_environment_rpc.sql
 *
 * Falls back to the non-atomic two-step PATCH if the RPC returns 404
 * (function not yet applied to the DB).  The fallback logs a warning and
 * documents its failure mode so operators know what they are getting.
 *
 * Returns the newly active environment record, or null on failure.
 */
export async function setActiveEnvironment(id: string): Promise<UnaxisEnvironment | null> {
  if (typeof fetch === "undefined") return null;

  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = buildHeaders();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    // ── Primary path: atomic RPC ─────────────────────────────────────────────
    // POST /rest/v1/rpc/switch_active_environment
    //   Body:    { "target_id": "<uuid>" }
    //   Returns: representation of the newly active row
    dbg("setActiveEnvironment → RPC path, target: " + id);

    const rpcRes = await fetch(kongUrl + "/rest/v1/rpc/switch_active_environment", {
      method:  "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body:    JSON.stringify({ target_id: id }),
      signal:  controller.signal,
    });

    // 404 means the migration hasn't been applied yet — fall through to PATCH
    if (rpcRes.status === 404) {
      dbg("RPC not found (migration not applied?) — falling back to two-step PATCH");
    } else {
      clearTimeout(timer);

      if (!rpcRes.ok) {
        const body = await rpcRes.text().catch(() => "");
        throw new Error("RPC switch_active_environment failed: " + rpcRes.status + " " + body.slice(0, 200));
      }

      const rows = await rpcRes.json() as EnvironmentRow[];
      if (rows.length === 0) {
        throw new Error("RPC returned no rows — environment not found: id=" + id);
      }

      dbg("RPC ok → " + rows[0]?.name);
      invalidateEnvironmentCache();
      return rowToEnvironment(rows[0]);
    }

    // ── Fallback path: two-step PATCH (non-atomic) ───────────────────────────
    // WARNING: If step 1 succeeds and step 2 fails, there is a window where
    // NO environment is active.  Apply the migration to eliminate this risk.
    // This path exists only to support environments where the migration has
    // not yet been run.
    dbg("WARN: using non-atomic two-step PATCH — apply 20260518_switch_active_environment_rpc.sql");

    const clearRes = await fetch(
      kongUrl + "/rest/v1/environments?id=neq.00000000-0000-0000-0000-000000000000",
      {
        method:  "PATCH",
        headers: { ...headers, "Prefer": "return=minimal" },
        body:    JSON.stringify({ active: false }),
        signal:  controller.signal,
      }
    );
    if (!clearRes.ok) {
      const body = await clearRes.text().catch(() => "");
      throw new Error("fallback clear-active failed: " + clearRes.status + " " + body.slice(0, 200));
    }

    const setRes = await fetch(
      kongUrl + "/rest/v1/environments?id=eq." + encodeURIComponent(id),
      {
        method:  "PATCH",
        headers: { ...headers, "Prefer": "return=representation" },
        body:    JSON.stringify({ active: true }),
        signal:  controller.signal,
      }
    );
    clearTimeout(timer);

    if (!setRes.ok) {
      // Step 1 cleared all active flags. Step 2 failed. We now have no active
      // environment. Log the exact state so the operator can recover.
      const body = await setRes.text().catch(() => "");
      throw new Error(
        "fallback set-active failed: " + setRes.status + " " + body.slice(0, 200) +
        " — WARNING: all active flags were cleared; you may need to manually set active=true on an environment row"
      );
    }

    const rows = await setRes.json() as EnvironmentRow[];
    if (rows.length === 0) {
      throw new Error("fallback: environment not found after set: id=" + id);
    }

    dbg("fallback ok → " + rows[0]?.name);
    invalidateEnvironmentCache();
    return rowToEnvironment(rows[0]);

  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    dbg("setActiveEnvironment error: " + msg);
    lastEnvironmentError = msg;
    return null;
  }
}

/**
 * Fetch decrypted credentials for an environment from vault.decrypted_secrets.
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
  const headers = buildHeaders();

  // Fetch only the specific secret IDs we need
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
 * Create a new environment record.
 * Only `name`, `type`, `agent_url`, and `agent_port` are required —
 * all other columns get sensible DB defaults.
 * Throws on failure so callers can surface errors in the TUI.
 */
export async function createEnvironment(payload: {
  name:       string;
  type?:      EnvironmentType;
  agent_url:  string;
  agent_port: number;
  [key: string]: unknown;
}): Promise<UnaxisEnvironment> {
  if (typeof fetch === "undefined") throw new Error("fetch not available");

  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = buildHeaders();

  const body = {
    name:         payload.name,
    type:         payload.type ?? "remote-docker",
    agent_url:    payload.agent_url,
    agent_port:   payload.agent_port,
    agent_status: "unknown",
    status:       "unknown",
    active:       false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(kongUrl + "/rest/v1/environments", {
      method:  "POST",
      headers: { ...headers, "Prefer": "return=representation" },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`PostgREST ${res.status}: ${text.slice(0, 200)}`);
    }

    const rows = await res.json() as EnvironmentRow[];
    if (!rows[0]) throw new Error("Insert succeeded but no row returned");
    invalidateEnvironmentCache();
    return rowToEnvironment(rows[0]);

  } catch (err) {
    clearTimeout(timer);
    throw err; // re-throw so wizard can display the error
  }
}

/**
 * Update the status of an environment (called by the infra health checker).
 * Does NOT bust the full cache — only updates the cached entry in-place.
 */
export async function updateEnvironmentStatus(
  id: string,
  status: EnvironmentStatus
): Promise<void> {
  if (typeof fetch === "undefined") return;

  ensureRuntimeEnv(true);
  const kongUrl = getRuntimeKongUrl();
  const headers = buildHeaders();

  // Optimistic in-memory update
  if (_cache) {
    for (const e of _cache) {
      if (e.id === id) { e.status = status; break; }
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);

  try {
    await fetch(kongUrl + "/rest/v1/environments?id=eq." + encodeURIComponent(id), {
      method:  "PATCH",
      headers: { ...headers, "Prefer": "return=minimal" },
      body:    JSON.stringify({ status }),
      signal:  controller.signal,
    });
  } catch {
    // Status update is best-effort — don't surface errors
  } finally {
    clearTimeout(timer);
  }
}

/** Bust the cache (e.g. after switching or creating an environment). */
export function invalidateEnvironmentCache(): void {
  _cache     = null;
  _fetchedAt = 0;
}

/**
 * Returns the Unix timestamp (ms) of the last SUCCESSFUL fetch from Supabase.
 * Returns 0 if environments have never been fetched successfully.
 * Used by useEnvManager to compute data age and decide whether to show a stale banner.
 */
export function getLastEnvironmentFetchTime(): number {
  return _fetchedAt;
}

/**
 * Returns the current error message from the last failed environment fetch,
 * or null if the last fetch succeeded.
 * This is a getter because `export let` live bindings are unreliable across
 * module boundaries in some bundler configurations.
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
