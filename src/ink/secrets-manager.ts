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
  /** Infisical project UNAXIS reads from, and the environment slug (dev/staging/prod). */
  projectId?: string;
  environment: string;
  /**
   * Off (default): builds keep using .env and only compare against the
   * manager (shadow mode, names logged). On: the manager's values win.
   * Flip it once `secrets check` shows no differences.
   */
  useForBuilds: boolean;
  /**
   * UNAXIS project slug → its vault project. Each UNAXIS project reads its own
   * vault project; `projectId`/`environment` above stay as the default for a
   * project that hasn't been linked.
   */
  projects: Record<string, VaultLink>;
};

export type VaultLink = { projectId: string; orgId: string; environment: string };

export function secretsConfig(raw: Record<string, any> = {}): SecretsConfig {
  const port = Number(raw.httpPort);
  return {
    image: String(raw.image || SECRETS_DEFAULTS.image),
    httpPort: Number.isInteger(port) && port > 0 ? port : SECRETS_DEFAULTS.httpPort,
    siteUrl: raw.siteUrl ? String(raw.siteUrl).replace(/\/+$/, "") : undefined,
    projectId: raw.projectId ? String(raw.projectId) : undefined,
    environment: raw.environment ? String(raw.environment) : "prod",
    useForBuilds: raw.useForBuilds === true,
    projects: Object.fromEntries(
      Object.entries((raw.projects ?? {}) as Record<string, any>)
        .filter(([, v]) => v && UUID.test(String(v.projectId)) && UUID.test(String(v.orgId)))
        .map(([k, v]) => [k, { projectId: String(v.projectId), orgId: String(v.orgId), environment: String(v.environment || "dev") }]),
    ),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isVaultId = (v: string) => UUID.test(v);

/** The vault project a UNAXIS project reads, or null when it has none linked. */
export function vaultLinkFor(c: SecretsConfig, projectSlug: string): VaultLink | null {
  return c.projects[projectSlug] ?? null;
}

/** The vault project's page in the Infisical web UI. */
export function vaultProjectUrl(base: string, link: Pick<VaultLink, "orgId" | "projectId">): string {
  return `${base.replace(/\/+$/, "")}/organizations/${link.orgId}/projects/secret-management/${link.projectId}/overview`;
}

/**
 * .infisical.json for a project's repo root: the Infisical CLI's own file, so
 * any clone on any device knows its vault project. IDs only — no secrets, no
 * server address (each device's `infisical login --domain` holds that).
 */
export function infisicalProjectFile(link: Pick<VaultLink, "projectId" | "environment">): string {
  return JSON.stringify({ workspaceId: link.projectId, defaultEnvironment: link.environment, gitBranchToEnvironmentMapping: null }, null, 2) + "\n";
}

export function siteUrl(c: SecretsConfig, host: string): string {
  return c.siteUrl ?? `http://${host}:${c.httpPort}`;
}

export type SecretsKeys = { encryptionKey: string; authSecret: string; dbPassword: string };

/** Infisical's environment. Telemetry off; signups are closed by the admin in the UI after the first account. */
export function renderAppEnv(c: SecretsConfig, host: string, k: SecretsKeys, mail: string[] = []): string[] {
  return [
    `ENCRYPTION_KEY=${k.encryptionKey}`,
    `AUTH_SECRET=${k.authSecret}`,
    `DB_CONNECTION_URI=postgres://infisical:${encodeURIComponent(k.dbPassword)}@${SECRETS_DEFAULTS.db}:5432/infisical`,
    `REDIS_URL=redis://${SECRETS_DEFAULTS.redis}:6379`,
    `SITE_URL=${siteUrl(c, host)}`,
    "TELEMETRY_ENABLED=false",
    "NODE_ENV=production",
    ...mail,
  ];
}

/**
 * Infisical's mail settings from the site's own SMTP settings in .env.
 * Without mail, "Forgot password" can't send anything — on 2026-10-14 the only
 * admin was locked out with no way back in. Empty when the site has no SMTP.
 */
export function infisicalMailEnv(env: Record<string, string>): string[] {
  const host = env.SMTP_HOST, user = env.SMTP_USER, pass = env.SMTP_PASS, from = env.SMTP_ADMIN_EMAIL;
  if (!host || !user || !pass || !from) return [];
  return [
    `SMTP_HOST=${host}`,
    `SMTP_PORT=${env.SMTP_PORT || "587"}`,
    `SMTP_USERNAME=${user}`,
    `SMTP_PASSWORD=${pass}`,
    `SMTP_FROM_ADDRESS=${from}`,
    `SMTP_FROM_NAME=${env.SMTP_SENDER_NAME ? `${env.SMTP_SENDER_NAME} secrets` : "Infisical"}`,
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

/** Parses KEY=VALUE lines the way the .env files are written (no expansion). */
export function parseDotenv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Names only — never values — for showing what differs between .env and the secrets manager. */
export function diffKeys(local: Record<string, string>, remote: Record<string, string>) {
  const onlyLocal = Object.keys(local).filter((k) => !(k in remote)).sort();
  const onlyRemote = Object.keys(remote).filter((k) => !(k in local)).sort();
  const changed = Object.keys(local).filter((k) => k in remote && local[k] !== remote[k]).sort();
  return { onlyLocal, onlyRemote, changed };
}
