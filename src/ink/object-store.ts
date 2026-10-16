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

/** The archive settings Postgres needs (ALTER SYSTEM), WAL every ≤ 60 s. */
export function archiveSettings(walgConfigPath: string): Array<[string, string]> {
  return [
    ["archive_mode", "on"],
    ["archive_command", `/usr/local/bin/wal-g --config ${walgConfigPath} wal-push %p`],
    ["archive_timeout", "60s"],
  ];
}
