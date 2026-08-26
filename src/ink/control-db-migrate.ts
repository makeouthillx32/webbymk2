// src/ink/control-db-migrate.ts
// ─────────────────────────────────────────────────────────────────────────────
// One-time import: pulls zones + environments from unenter.db (Supabase REST)
// and writes them into the local SQLite control-plane DB.
//
// Exposed as:   unaxis db migrate-control
//
// Safe to re-run — uses UPSERT so existing rows are updated, not duplicated.
// The Supabase connection is read-only during migration; nothing is deleted
// from unenter.db.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ensureRuntimeEnv,
  getRuntimeKongUrl,
  getRuntimeServiceKey,
} from "../utils/runtimeEnv.js";
import {
  dbUpsertZone,
  dbUpsertEnvironment,
  dbGetInfo,
} from "./control-db.ts";
import type { UnaxisEnvironment, EnvironmentType, EnvironmentStatus, AgentStatus } from "./environment-store.ts";

function buildHeaders(serviceKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${serviceKey}`,
    "apikey":        serviceKey,
    "Accept":        "application/json",
  };
}

interface SupabaseZoneRow {
  id:               string;
  key:              string;
  label:            string;
  domain:           string;
  service:          string;
  container:        string;
  image:            string;
  dockerfile:       string | null;
  upstream_env_key: string;
  sort_order:       number;
  enabled:          boolean;
  environment_id:   string | null;
  created_at?:      string;
  updated_at?:      string;
}

interface SupabaseEnvRow {
  id:                         string;
  name:                       string;
  type:                       string;
  status:                     string;
  active:                     boolean;
  is_default_target:          boolean;
  docker_url:                 string;
  machine_role:               string;
  agent_url:                  string;
  agent_port:                 number;
  agent_status:               string;
  agent_last_seen_at:         string | null;
  agent_version:              string;
  agent_token_secret_id:      string | null;
  npm_host:                   string;
  npm_port:                   number;
  proxy_host:                 string;
  proxy_port:                 number;
  domain:                     string;
  ddns_hostname:              string;
  public_url:                 string;
  tls_config:                 any;
  npm_secret_id:              string | null;
  azure_app_id_secret_id:     string | null;
  azure_tenant_id_secret_id:  string | null;
  azure_auth_key_secret_id:   string | null;
  tags:                       string[];
  sort_order:                 number;
  created_at:                 string;
  updated_at:                 string;
}

async function fetchFromSupabase<T>(
  url: string,
  headers: Record<string, string>,
  onLine: (l: string) => void,
): Promise<T[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      onLine(`  ✗ HTTP ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    return await res.json() as T[];
  } catch (err) {
    clearTimeout(timer);
    onLine(`  ✗ fetch error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Migrate zones + environments from unenter.db → local SQLite control-db.
 * onLine receives progress lines for display in the TUI operation overlay.
 * Returns exit code: 0 = success, 1 = error.
 */
export async function migrateControlDb(
  onLine: (line: string) => void,
): Promise<number> {
  onLine("── UNAXIS control-db migration ─────────────────────────");
  onLine("  Source:  unenter.db (Supabase REST via Kong)");
  onLine("  Target:  local SQLite control.db");
  onLine("");

  ensureRuntimeEnv(true);
  const kongUrl    = getRuntimeKongUrl();
  const serviceKey = getRuntimeServiceKey();

  if (!serviceKey) {
    onLine("  ✗ SERVICE_ROLE_KEY not loaded — cannot connect to unenter.db");
    onLine("  Make sure UNAXIS is running in the project root with .env loaded.");
    return 1;
  }

  onLine(`  Kong:    ${kongUrl}`);
  onLine("");

  const headers = buildHeaders(serviceKey);

  // ── Migrate zones ──────────────────────────────────────────────────────────
  onLine("→ Fetching zones from unenter.db...");
  const zoneUrl = `${kongUrl}/rest/v1/zones?order=sort_order.asc&select=*`;
  const zones = await fetchFromSupabase<SupabaseZoneRow>(zoneUrl, headers, onLine);
  if (!zones) {
    onLine("  ✗ Failed to fetch zones — aborting");
    return 1;
  }

  onLine(`  Fetched ${zones.length} zones`);
  let zoneOk = 0;
  for (const z of zones) {
    try {
      dbUpsertZone({
        id:            z.id,
        key:           z.key,
        label:         z.label,
        domain:        z.domain,
        service:       z.service,
        container:     z.container,
        image:         z.image,
        dockerfile:    z.dockerfile,
        upstreamEnvKey: z.upstream_env_key,
        sortOrder:     z.sort_order,
        enabled:       z.enabled,
        environmentId: z.environment_id,
      });
      zoneOk++;
    } catch (err) {
      onLine(`  ⚠ zone ${z.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  onLine(`  ✓ ${zoneOk}/${zones.length} zones migrated`);
  onLine("");

  // ── Migrate environments ───────────────────────────────────────────────────
  onLine("→ Fetching environments from unenter.db...");
  const envUrl = `${kongUrl}/rest/v1/environments?order=sort_order.asc&select=*`;
  const envs = await fetchFromSupabase<SupabaseEnvRow>(envUrl, headers, onLine);
  if (!envs) {
    onLine("  ✗ Failed to fetch environments — aborting");
    return 1;
  }

  onLine(`  Fetched ${envs.length} environments`);
  let envOk = 0;
  for (const e of envs) {
    try {
      const env: UnaxisEnvironment = {
        id:               e.id,
        name:             e.name,
        type:             e.type as EnvironmentType,
        status:           e.status as EnvironmentStatus,
        active:           e.active,
        isDefaultTarget:  e.is_default_target ?? e.active,
        dockerUrl:        e.docker_url        ?? "",
        machineRole:      e.machine_role      ?? "",
        agentUrl:         e.agent_url         ?? "",
        agentPort:        e.agent_port        ?? 8001,
        agentStatus:      (e.agent_status     ?? "unknown") as AgentStatus,
        agentLastSeenAt:  e.agent_last_seen_at ?? null,
        agentVersion:     e.agent_version     ?? "",
        agentTokenSecretId: e.agent_token_secret_id ?? null,
        npmHost:          e.npm_host          ?? "",
        npmPort:          e.npm_port          ?? 81,
        proxyHost:        e.proxy_host        ?? "",
        proxyPort:        e.proxy_port        ?? 3080,
        domain:           e.domain            ?? "",
        ddnsHostname:     e.ddns_hostname      ?? "",
        publicUrl:        e.public_url         ?? "",
        tlsConfig:        typeof e.tls_config === "string"
                            ? JSON.parse(e.tls_config)
                            : (e.tls_config ?? { tls: false, keyPath: "", certPath: "", caCertPath: "", skipVerify: false, skipClientVerify: false }),
        npmSecretId:            e.npm_secret_id             ?? null,
        azureAppIdSecretId:     e.azure_app_id_secret_id    ?? null,
        azureTenantIdSecretId:  e.azure_tenant_id_secret_id ?? null,
        azureAuthKeySecretId:   e.azure_auth_key_secret_id  ?? null,
        tags:             Array.isArray(e.tags) ? e.tags : [],
        sortOrder:        e.sort_order  ?? 0,
        createdAt:        e.created_at  ?? new Date().toISOString(),
        updatedAt:        e.updated_at  ?? new Date().toISOString(),
      };
      dbUpsertEnvironment(env);
      envOk++;
    } catch (err) {
      onLine(`  ⚠ env ${e.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  onLine(`  ✓ ${envOk}/${envs.length} environments migrated`);
  onLine("");

  // ── Summary ────────────────────────────────────────────────────────────────
  const info = dbGetInfo();
  onLine("── Migration complete ───────────────────────────────────");
  onLine(`  DB path:      ${info.path}`);
  onLine(`  Zones:        ${info.zoneCount}`);
  onLine(`  Environments: ${info.envCount}`);
  onLine(`  Migrations:   ${info.migrations} schema version(s)`);
  onLine("");
  onLine("  ✓ UNAXIS control-db is now standalone.");
  onLine("    Restart the TUI to load from SQLite.");

  return 0;
}
