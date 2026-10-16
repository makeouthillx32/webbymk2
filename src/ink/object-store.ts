// src/ink/object-store.ts
// Production data gets a live copy on another machine (see vault
// Architecture/state-model-and-durability). Step 1: Postgres streams its
// write-ahead log and base backups to an S3-compatible object store on
// another UNAXIS host, with WAL-G (already in the supabase/postgres image).
//
// The object store is Garage (self-hosted, S3-compatible, built for
// replication across small machines). MinIO's community images were withdrawn
// from Docker Hub and quay.io in 2025.
//
// Pure helpers only — rendering configs and parsing CLI output; the Docker
// and Postgres side is object-store-store.ts.

export const OBJECTS_DEFAULTS = {
  image: "dxflrs/garage:v2.4.1",
  container: "unt_objects",
  volume: "unaxis_objects",
  s3Port: 3900,
  rpcPort: 3901,
  adminPort: 3903,
  region: "garage",
  walBucket: "pg-wal",
  walKeyName: "unenter-pg",
  capacity: "500G",
} as const;

export type ObjectStoreKeys = {
  rpcSecret: string;   // 32 bytes hex — Garage node-to-node secret
  adminToken: string;  // Garage admin API token
  walKeyId?: string;   // S3 access key for WAL-G
  walSecret?: string;
};

export function renderGarageToml(k: Pick<ObjectStoreKeys, "rpcSecret" | "adminToken">): string {
  const d = OBJECTS_DEFAULTS;
  return [
    'metadata_dir = "/var/lib/garage/meta"',
    'data_dir = "/var/lib/garage/data"',
    'db_engine = "sqlite"',
    // One node today; adding POWER/OPT1 later raises this to 2–3.
    "replication_factor = 1",
    `rpc_bind_addr = "[::]:${d.rpcPort}"`,
    `rpc_public_addr = "127.0.0.1:${d.rpcPort}"`,
    `rpc_secret = "${k.rpcSecret}"`,
    "",
    "[s3_api]",
    `s3_region = "${d.region}"`,
    `api_bind_addr = "[::]:${d.s3Port}"`,
    'root_domain = ".s3.garage.localhost"',
    "",
    "[admin]",
    `api_bind_addr = "[::]:${d.adminPort}"`,
    `admin_token = "${k.adminToken}"`,
    "",
  ].join("\n");
}

/** WAL-G's config file (JSON keys = its env var names). */
export function renderWalgConfig(o: { endpoint: string; keyId: string; secret: string; prefix: string }): string {
  return JSON.stringify({
    WALG_S3_PREFIX: `s3://${OBJECTS_DEFAULTS.walBucket}/${o.prefix}`,
    AWS_ENDPOINT: o.endpoint,
    AWS_REGION: OBJECTS_DEFAULTS.region,
    AWS_S3_FORCE_PATH_STYLE: "true",
    AWS_ACCESS_KEY_ID: o.keyId,
    AWS_SECRET_ACCESS_KEY: o.secret,
    WALG_COMPRESSION_METHOD: "brotli",
    // Base backups connect as the superuser over loopback (trusted in
    // pg_hba; the local socket wants a password for supabase_admin).
    PGHOST: "127.0.0.1",
    PGUSER: "supabase_admin",
    PGDATABASE: "postgres",
  }, null, 2) + "\n";
}

/** `garage node id -q` → "<hex id>@<addr>" → the id. */
export function parseNodeId(out: string): string | null {
  return /\b([0-9a-f]{16,64})@/i.exec(out)?.[1] ?? null;
}

/** `garage key create` output → key id + secret. */
export function parseKeyCreate(out: string): { keyId: string; secret: string } | null {
  const id = /Key ID:\s*(GK[0-9a-f]+)/i.exec(out)?.[1];
  const secret = /Secret key:\s*([0-9a-f]{32,})/i.exec(out)?.[1];
  return id && secret ? { keyId: id, secret } : null;
}

/** What the TUI shows about the live copy (CLI, DB panel, Services panel). */
export type ArchiveSummary = {
  store: { key: string; envName: string; url: string; state: string } | null;
  mode: string | null;          // archive_mode
  archived: number;             // segments archived since the last stats reset
  lastWal: string | null;
  lastAt: string | null;        // ISO-ish timestamp from pg_stat_archiver
  failed: number;
  lastFailAt: string | null;
  pending: number;              // segments written but not shipped yet (archive_status/*.ready)
  baseBackups: number | null;   // null = not read
  newestBase: string | null;
};

/** One pg_stat_archiver row as `mode|count|wal|at|failed|failAt|pending` ("-" = null). */
export function parseArchiverRow(row: string): Pick<ArchiveSummary, "mode" | "archived" | "lastWal" | "lastAt" | "failed" | "lastFailAt" | "pending"> {
  const [mode, count, wal, at, failed, failAt, pending] = row.trim().split("|");
  const v = (s?: string) => (!s || s === "-" ? null : s);
  return { mode: v(mode), archived: Number(count) || 0, lastWal: v(wal), lastAt: v(at), failed: Number(failed) || 0, lastFailAt: v(failAt), pending: Number(pending) || 0 };
}

/** Postgres timestamptz text ("2026-10-16 16:52:38.9+00") → ms; NaN if absent. */
const pgTime = (t: string | null) => t ? Date.parse(t.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) : NaN;

const ago = (ms: number) => ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))}s ago` : ms < 5_400_000 ? `${Math.round(ms / 60_000)}m ago` : `${Math.round(ms / 3_600_000)}h ago`;

/**
 * One line + a tone. A quiet database ships nothing (archive_timeout only
 * switches segments that have writes), so silence is fine; what matters is
 * the latest attempt failing, or segments piling up unshipped.
 */
export function archiveHealth(s: ArchiveSummary, now = Date.now()): { tone: "ok" | "warn" | "off"; text: string } {
  if (!s.store) return { tone: "off", text: "no live copy — data place <env> && data deploy" };
  if (s.store.state !== "running") return { tone: "warn", text: `object store on ${s.store.envName} is ${s.store.state}` };
  const base = s.baseBackups == null ? "" : ` · ${s.baseBackups} base backup${s.baseBackups === 1 ? "" : "s"}`;
  if (s.mode !== "on") return { tone: "off", text: `object store on ${s.store.envName}; WAL archiving off (archive_mode=${s.mode ?? "?"})${base}` };
  const last = pgTime(s.lastAt);
  const failAt = pgTime(s.lastFailAt);
  const lastText = Number.isFinite(last) ? `last ${ago(now - last)}` : "nothing archived yet";
  const failing = s.failed > 0 && Number.isFinite(failAt) && (!Number.isFinite(last) || failAt > last);
  const backlog = s.pending > 3;
  return {
    tone: failing || backlog ? "warn" : "ok",
    text: `WAL → ${s.store.envName} · ${lastText}${s.pending ? ` · ${s.pending} waiting` : ""} · ${s.failed} failure${s.failed === 1 ? "" : "s"}${failing ? " (failing now)" : ""}${base}`,
  };
}

/** The archive settings Postgres needs (ALTER SYSTEM), WAL every ≤ 60 s. */
export function archiveSettings(walgConfigPath: string): Array<[string, string]> {
  return [
    ["archive_mode", "on"],
    ["archive_command", `/usr/local/bin/wal-g --config ${walgConfigPath} wal-push %p`],
    ["archive_timeout", "60s"],
  ];
}
