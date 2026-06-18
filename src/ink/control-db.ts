// src/ink/control-db.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS standalone control-plane database.
//
// Uses bun:sqlite — zero network dependency, zero server, embedded in the
// binary.  Replaces the Supabase `zones` and `environments` tables that were
// previously stored in unenter.live's project database.
//
// DB location: ~/.unaxis/control.db  (or UNAXIS_CONTROL_DB env override)
//
// Schema migrations run automatically on first open so new installs and
// upgrades are handled without manual intervention.
//
// Public API mirrors the shapes used by zone-store.ts and environment-store.ts
// so callers can be swapped with minimal changes.
// ─────────────────────────────────────────────────────────────────────────────

import type { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import type { Zone } from "../config/zones.ts";
import type {
  UnaxisEnvironment,
  EnvironmentType,
  EnvironmentStatus,
  AgentStatus,
} from "./environment-store.ts";

// ── DB path resolution ────────────────────────────────────────────────────────

function resolveDbPath(): string {
  if (process.env["UNAXIS_CONTROL_DB"]) {
    return process.env["UNAXIS_CONTROL_DB"];
  }
  const appData = process.env["APPDATA"] ?? join(homedir(), ".config");
  return join(appData, "unaxis", "control.db");
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _db: Database | null = null;

export function getControlDb(): Database {
  if (_db) return _db;

  const dbPath = resolveDbPath();
  const dir    = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Lazily load bun:sqlite to avoid ESM loading errors under plain Node
  const { Database: SqliteDatabase } = require("bun:sqlite");
  _db = new SqliteDatabase(dbPath, { create: true }) as Database;
  _db.exec("PRAGMA journal_mode = WAL;");   // safe concurrent reads
  _db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(_db);
  return _db;
}

/** Exposed for testing — replaces the singleton with an in-memory DB. */
export function _setControlDbForTest(db: Database): void {
  _db = db;
}

// ── Migrations ────────────────────────────────────────────────────────────────

const MIGRATIONS: string[] = [
  // 001 — initial schema
  `CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS zones (
    id               TEXT    NOT NULL PRIMARY KEY,
    key              TEXT    NOT NULL UNIQUE,
    label            TEXT    NOT NULL,
    domain           TEXT    NOT NULL,
    service          TEXT    NOT NULL,
    container        TEXT    NOT NULL,
    image            TEXT    NOT NULL,
    dockerfile       TEXT,
    upstream_env_key TEXT    NOT NULL,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    enabled          INTEGER NOT NULL DEFAULT 1,
    environment_id   TEXT,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS environments (
    id                        TEXT    NOT NULL PRIMARY KEY,
    name                      TEXT    NOT NULL,
    type                      TEXT    NOT NULL DEFAULT 'local-docker',
    status                    TEXT    NOT NULL DEFAULT 'unknown',
    active                    INTEGER NOT NULL DEFAULT 0,
    is_default_target         INTEGER NOT NULL DEFAULT 0,
    docker_url                TEXT    NOT NULL DEFAULT '',
    machine_role              TEXT    NOT NULL DEFAULT '',
    agent_url                 TEXT    NOT NULL DEFAULT '',
    agent_port                INTEGER NOT NULL DEFAULT 8001,
    agent_status              TEXT    NOT NULL DEFAULT 'unknown',
    agent_last_seen_at        TEXT,
    agent_version             TEXT    NOT NULL DEFAULT '',
    agent_token_secret_id     TEXT,
    npm_host                  TEXT    NOT NULL DEFAULT '',
    npm_port                  INTEGER NOT NULL DEFAULT 81,
    proxy_host                TEXT    NOT NULL DEFAULT '',
    proxy_port                INTEGER NOT NULL DEFAULT 3080,
    domain                    TEXT    NOT NULL DEFAULT '',
    ddns_hostname             TEXT    NOT NULL DEFAULT '',
    public_url                TEXT    NOT NULL DEFAULT '',
    tls_config                TEXT    NOT NULL DEFAULT '{"tls":false,"keyPath":"","certPath":"","caCertPath":"","skipVerify":false,"skipClientVerify":false}',
    npm_secret_id             TEXT,
    azure_app_id_secret_id    TEXT,
    azure_tenant_id_secret_id TEXT,
    azure_auth_key_secret_id  TEXT,
    tags                      TEXT    NOT NULL DEFAULT '[]',
    sort_order                INTEGER NOT NULL DEFAULT 0,
    created_at                TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at                TEXT    NOT NULL DEFAULT (datetime('now'))
  );`,
];

function runMigrations(db: Database): void {
  // Ensure the migrations tracking table exists before we try to read it.
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL UNIQUE,
    applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );`);

  const applied = new Set(
    (db.query("SELECT name FROM _migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  MIGRATIONS.forEach((sql, i) => {
    const name = String(i + 1).padStart(3, "0");
    if (applied.has(name)) return;
    db.exec(sql);
    db.run("INSERT INTO _migrations (name) VALUES (?)", [name]);
  });
}

// ── Row shape helpers ─────────────────────────────────────────────────────────

interface ZoneRow {
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
  enabled:          number;   // SQLite INTEGER: 1 = true, 0 = false
  environment_id:   string | null;
}

interface EnvironmentRow {
  id:                         string;
  name:                       string;
  type:                       string;
  status:                     string;
  active:                     number;
  is_default_target:          number;
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
  tls_config:                 string;
  npm_secret_id:              string | null;
  azure_app_id_secret_id:     string | null;
  azure_tenant_id_secret_id:  string | null;
  azure_auth_key_secret_id:   string | null;
  tags:                       string;
  sort_order:                 number;
  created_at:                 string;
  updated_at:                 string;
}

function rowToZone(r: ZoneRow): Zone {
  return {
    key:            r.key,
    label:          r.label,
    domain:         r.domain,
    service:        r.service,
    container:      r.container,
    image:          r.image,
    dockerfile:     r.dockerfile ?? undefined,
    upstreamEnvKey: r.upstream_env_key,
    environmentId:  r.environment_id ?? null,
  };
}

function rowToEnvironment(r: EnvironmentRow): UnaxisEnvironment {
  let tlsConfig: UnaxisEnvironment["tlsConfig"];
  try {
    tlsConfig = JSON.parse(r.tls_config);
  } catch {
    tlsConfig = { tls: false, keyPath: "", certPath: "", caCertPath: "", skipVerify: false, skipClientVerify: false };
  }

  let tags: string[];
  try {
    tags = JSON.parse(r.tags);
  } catch {
    tags = [];
  }

  return {
    id:               r.id,
    name:             r.name,
    type:             r.type as EnvironmentType,
    status:           r.status as EnvironmentStatus,
    active:           r.active === 1,
    isDefaultTarget:  r.is_default_target === 1,
    dockerUrl:        r.docker_url,
    machineRole:      r.machine_role,
    agentUrl:         r.agent_url,
    agentPort:        r.agent_port,
    agentStatus:      r.agent_status as AgentStatus,
    agentLastSeenAt:  r.agent_last_seen_at,
    agentVersion:     r.agent_version,
    agentTokenSecretId: r.agent_token_secret_id,
    npmHost:          r.npm_host,
    npmPort:          r.npm_port,
    proxyHost:        r.proxy_host,
    proxyPort:        r.proxy_port,
    domain:           r.domain,
    ddnsHostname:     r.ddns_hostname,
    publicUrl:        r.public_url,
    tlsConfig,
    npmSecretId:            r.npm_secret_id,
    azureAppIdSecretId:     r.azure_app_id_secret_id,
    azureTenantIdSecretId:  r.azure_tenant_id_secret_id,
    azureAuthKeySecretId:   r.azure_auth_key_secret_id,
    tags,
    sortOrder:  r.sort_order,
    createdAt:  r.created_at,
    updatedAt:  r.updated_at,
  };
}

// ── UUID helper ───────────────────────────────────────────────────────────────

function newUuid(): string {
  // crypto.randomUUID() is available in Bun
  return crypto.randomUUID();
}

// ── Zone API ──────────────────────────────────────────────────────────────────

/** Return all enabled zones sorted by sort_order. */
export function dbGetZones(): Zone[] {
  const db = getControlDb();
  const rows = db.query(
    "SELECT * FROM zones WHERE enabled = 1 ORDER BY sort_order ASC",
  ).all() as ZoneRow[];
  return rows.map(rowToZone);
}

/** Return all zones (including disabled) — for management views. */
export function dbGetAllZones(): ZoneRow[] {
  const db = getControlDb();
  return db.query(
    "SELECT * FROM zones ORDER BY sort_order ASC",
  ).all() as ZoneRow[];
}

/** Get a single zone by key. Returns null if not found. */
export function dbGetZoneByKey(key: string): Zone | null {
  const db = getControlDb();
  const row = db.query(
    "SELECT * FROM zones WHERE key = ?",
  ).get(key) as ZoneRow | undefined;
  return row ? rowToZone(row) : null;
}

/** Insert or replace a zone row. Generates an id if not provided. */
export function dbUpsertZone(zone: {
  id?:              string;
  key:              string;
  label:            string;
  domain:           string;
  service:          string;
  container:        string;
  image:            string;
  dockerfile?:      string | null;
  upstreamEnvKey:   string;
  sortOrder?:       number;
  enabled?:         boolean;
  environmentId?:   string | null;
}): void {
  const db = getControlDb();
  db.run(
    `INSERT INTO zones
       (id, key, label, domain, service, container, image, dockerfile,
        upstream_env_key, sort_order, enabled, environment_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       label            = excluded.label,
       domain           = excluded.domain,
       service          = excluded.service,
       container        = excluded.container,
       image            = excluded.image,
       dockerfile       = excluded.dockerfile,
       upstream_env_key = excluded.upstream_env_key,
       sort_order       = excluded.sort_order,
       enabled          = excluded.enabled,
       environment_id   = excluded.environment_id,
       updated_at       = datetime('now')`,
    [
      zone.id ?? newUuid(),
      zone.key,
      zone.label,
      zone.domain,
      zone.service,
      zone.container,
      zone.image,
      zone.dockerfile ?? null,
      zone.upstreamEnvKey,
      zone.sortOrder ?? 0,
      zone.enabled !== false ? 1 : 0,
      zone.environmentId ?? null,
    ],
  );
}

/** Mark a zone as disabled (soft delete). */
export function dbDisableZone(key: string): void {
  const db = getControlDb();
  db.run(
    "UPDATE zones SET enabled = 0, updated_at = datetime('now') WHERE key = ?",
    [key],
  );
}

/** Hard-delete a zone row by key. */
export function dbDeleteZone(key: string): void {
  const db = getControlDb();
  db.run("DELETE FROM zones WHERE key = ?", [key]);
}

// ── Environment API ───────────────────────────────────────────────────────────

/** Return all environments sorted by sort_order. */
export function dbGetEnvironments(): UnaxisEnvironment[] {
  const db = getControlDb();
  const rows = db.query(
    "SELECT * FROM environments ORDER BY sort_order ASC",
  ).all() as EnvironmentRow[];
  return rows.map(rowToEnvironment);
}

/** Get a single environment by id. Returns null if not found. */
export function dbGetEnvironmentById(id: string): UnaxisEnvironment | null {
  const db = getControlDb();
  const row = db.query(
    "SELECT * FROM environments WHERE id = ?",
  ).get(id) as EnvironmentRow | undefined;
  return row ? rowToEnvironment(row) : null;
}

/** Insert or replace an environment row. */
export function dbUpsertEnvironment(env: UnaxisEnvironment): void {
  const db = getControlDb();
  db.run(
    `INSERT INTO environments
       (id, name, type, status, active, is_default_target,
        docker_url, machine_role, agent_url, agent_port, agent_status,
        agent_last_seen_at, agent_version, agent_token_secret_id,
        npm_host, npm_port, proxy_host, proxy_port, domain, ddns_hostname,
        public_url, tls_config, npm_secret_id, azure_app_id_secret_id,
        azure_tenant_id_secret_id, azure_auth_key_secret_id,
        tags, sort_order, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       name                      = excluded.name,
       type                      = excluded.type,
       status                    = excluded.status,
       active                    = excluded.active,
       is_default_target         = excluded.is_default_target,
       docker_url                = excluded.docker_url,
       machine_role              = excluded.machine_role,
       agent_url                 = excluded.agent_url,
       agent_port                = excluded.agent_port,
       agent_status              = excluded.agent_status,
       agent_last_seen_at        = excluded.agent_last_seen_at,
       agent_version             = excluded.agent_version,
       agent_token_secret_id     = excluded.agent_token_secret_id,
       npm_host                  = excluded.npm_host,
       npm_port                  = excluded.npm_port,
       proxy_host                = excluded.proxy_host,
       proxy_port                = excluded.proxy_port,
       domain                    = excluded.domain,
       ddns_hostname             = excluded.ddns_hostname,
       public_url                = excluded.public_url,
       tls_config                = excluded.tls_config,
       npm_secret_id             = excluded.npm_secret_id,
       azure_app_id_secret_id    = excluded.azure_app_id_secret_id,
       azure_tenant_id_secret_id = excluded.azure_tenant_id_secret_id,
       azure_auth_key_secret_id  = excluded.azure_auth_key_secret_id,
       tags                      = excluded.tags,
       sort_order                = excluded.sort_order,
       updated_at                = datetime('now')`,
    [
      env.id,
      env.name,
      env.type,
      env.status,
      env.active           ? 1 : 0,
      env.isDefaultTarget  ? 1 : 0,
      env.dockerUrl,
      env.machineRole,
      env.agentUrl,
      env.agentPort,
      env.agentStatus,
      env.agentLastSeenAt ?? null,
      env.agentVersion,
      env.agentTokenSecretId ?? null,
      env.npmHost,
      env.npmPort,
      env.proxyHost,
      env.proxyPort,
      env.domain,
      env.ddnsHostname,
      env.publicUrl,
      JSON.stringify(env.tlsConfig),
      env.npmSecretId             ?? null,
      env.azureAppIdSecretId      ?? null,
      env.azureTenantIdSecretId   ?? null,
      env.azureAuthKeySecretId    ?? null,
      JSON.stringify(env.tags),
      env.sortOrder,
      env.createdAt,
    ],
  );
}

/**
 * Update only the agent health fields on an environment row.
 * More efficient than a full upsert for ping results.
 */
export function dbUpdateAgentStatus(
  envId:        string,
  agentStatus:  AgentStatus,
  agentVersion: string,
  lastSeenAt:   string | null,
): void {
  const db = getControlDb();
  db.run(
    `UPDATE environments
     SET agent_status       = ?,
         agent_version      = ?,
         agent_last_seen_at = ?,
         updated_at         = datetime('now')
     WHERE id = ?`,
    [agentStatus, agentVersion, lastSeenAt, envId],
  );
}

/**
 * Set one environment as the default deploy target.
 * Clears is_default_target on all others atomically (single transaction).
 */
export function dbSetDefaultTarget(envId: string): void {
  const db = getControlDb();
  const setDefault = db.transaction(() => {
    db.run("UPDATE environments SET is_default_target = 0, updated_at = datetime('now')");
    db.run(
      "UPDATE environments SET is_default_target = 1, active = 1, updated_at = datetime('now') WHERE id = ?",
      [envId],
    );
  });
  setDefault();
}

/**
 * Update only the status field on an environment row.
 * More efficient than a full upsert for infra health check results.
 */
export function dbUpdateEnvironmentStatus(
  envId:  string,
  status: string,
): void {
  const db = getControlDb();
  db.run(
    `UPDATE environments
     SET status     = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [status, envId],
  );
}

/** Hard-delete an environment row by id. */
export function dbDeleteEnvironment(envId: string): void {
  const db = getControlDb();
  db.run("DELETE FROM environments WHERE id = ?", [envId]);
}

/**
 * Merge-dedup environments by name.
 * When two rows share the same name, keeps the one with the real UUID
 * (not the auto-seed `00000000-…-0001` placeholder) and copies any
 * non-empty fields from the other row before deleting it.
 * Returns the number of duplicates removed.
 */
export function dbDeduplicateEnvironments(): number {
  const db   = getControlDb();
  const rows = db.query("SELECT * FROM environments ORDER BY created_at ASC").all() as EnvironmentRow[];

  const byName = new Map<string, EnvironmentRow[]>();
  for (const r of rows) {
    const group = byName.get(r.name) ?? [];
    group.push(r);
    byName.set(r.name, group);
  }

  let removed = 0;
  for (const [, group] of byName) {
    if (group.length < 2) continue;

    // Keep the row whose id doesn't look like a placeholder (all zeros + 0001)
    const isPlaceholder = (id: string) => /^0{8}-0{4}-0{4}-0{4}-0{8}0{3}[0-9]$/.test(id);
    const keeper = group.find((r) => !isPlaceholder(r.id)) ?? group[group.length - 1]!;
    const dupes  = group.filter((r) => r.id !== keeper.id);

    for (const dupe of dupes) {
      // Merge any non-empty fields from dupe into keeper before deletion.
      const patch: Partial<EnvironmentRow> = {};
      if (!keeper.npm_host   && dupe.npm_host)   patch.npm_host   = dupe.npm_host;
      if (!keeper.npm_port   && dupe.npm_port)   patch.npm_port   = dupe.npm_port;
      if (!keeper.proxy_host && dupe.proxy_host) patch.proxy_host = dupe.proxy_host;
      if (!keeper.proxy_port && dupe.proxy_port) patch.proxy_port = dupe.proxy_port;

      if (Object.keys(patch).length > 0) {
        const sets   = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
        const values = [...Object.values(patch), keeper.id];
        db.run(`UPDATE environments SET ${sets}, updated_at = datetime('now') WHERE id = ?`, values);
      }

      db.run("DELETE FROM environments WHERE id = ?", [dupe.id]);
      removed++;
    }
  }

  return removed;
}

// ── Info ──────────────────────────────────────────────────────────────────────

export interface ControlDbInfo {
  path:        string;
  zoneCount:   number;
  envCount:    number;
  migrations:  number;
}

export function dbGetInfo(): ControlDbInfo {
  const db     = getControlDb();
  const path   = resolveDbPath();
  const zones  = (db.query("SELECT COUNT(*) as n FROM zones").get() as { n: number }).n;
  const envs   = (db.query("SELECT COUNT(*) as n FROM environments").get() as { n: number }).n;
  const migs   = (db.query("SELECT COUNT(*) as n FROM _migrations").get() as { n: number }).n;
  return { path, zoneCount: zones, envCount: envs, migrations: migs };
}
