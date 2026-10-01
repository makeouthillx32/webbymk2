// src/ink/secrets-manager.ts
// ─────────────────────────────────────────────────────────────────────────────
// The secrets manager (self-hosted Infisical) as a UNAXIS role. Secrets live
// there per project and per environment, with per-person / per-agent access
// and an audit log, instead of in .env files on the dev drive. Like the forge
// it is placed on a host (`secrets@<env>`) and deployed through that host's
// agent: Infisical + its own Postgres + its own Redis on a private network.
// Pure logic only; side effects live in secrets-manager-store.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const SECRETS_DEFAULTS = {
  image: "infisical/infisical:v0.165.16",
  postgresImage: "postgres:16-alpine",
  redisImage: "redis:7-alpine",
  network: "unaxis_secrets",
  app: "unt_secrets",
  db: "unt_secrets_db",
  redis: "unt_secrets_redis",
  dbVolume: "unaxis_secrets_pg",
  httpPort: 8222,
} as const;

export type SecretsConfig = {
  image: string;
  httpPort: number;
  /** Overrides the derived URL, e.g. once a public hostname exists. */
  siteUrl?: string;
};

export function secretsConfig(raw: Record<string, any> = {}): SecretsConfig {
  const port = Number(raw.httpPort);
  return {
    image: String(raw.image || SECRETS_DEFAULTS.image),
    httpPort: Number.isInteger(port) && port > 0 ? port : SECRETS_DEFAULTS.httpPort,
    siteUrl: raw.siteUrl ? String(raw.siteUrl).replace(/\/+$/, "") : undefined,
  };
}

export function siteUrl(c: SecretsConfig, host: string): string {
  return c.siteUrl ?? `http://${host}:${c.httpPort}`;
}

export type SecretsKeys = { encryptionKey: string; authSecret: string; dbPassword: string };

/** Infisical's environment. Telemetry off; signups are closed by the admin in the UI after the first account. */
export function renderAppEnv(c: SecretsConfig, host: string, k: SecretsKeys): string[] {
  return [
    `ENCRYPTION_KEY=${k.encryptionKey}`,
    `AUTH_SECRET=${k.authSecret}`,
    `DB_CONNECTION_URI=postgres://infisical:${encodeURIComponent(k.dbPassword)}@${SECRETS_DEFAULTS.db}:5432/infisical`,
    `REDIS_URL=redis://${SECRETS_DEFAULTS.redis}:6379`,
    `SITE_URL=${siteUrl(c, host)}`,
    "TELEMETRY_ENABLED=false",
    "NODE_ENV=production",
  ];
}

export function renderDbEnv(k: SecretsKeys): string[] {
  return ["POSTGRES_USER=infisical", `POSTGRES_PASSWORD=${k.dbPassword}`, "POSTGRES_DB=infisical"];
}

/** ENCRYPTION_KEY: 16 random bytes as hex; AUTH_SECRET: 32 random bytes as base64 (Infisical's documented formats). */
export function validKeys(k: Partial<SecretsKeys>): k is SecretsKeys {
  return /^[0-9a-f]{32}$/.test(k.encryptionKey ?? "")
    && Buffer.from(k.authSecret ?? "", "base64").length === 32
    && (k.dbPassword ?? "").length >= 24;
}
