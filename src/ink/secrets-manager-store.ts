// src/ink/secrets-manager-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Side-effecting half of secrets-manager.ts: placing Infisical on a UNAXIS
// host, deploying its three containers through that host's agent, and dumping
// its database so the nightly restic backup carries it.
//
// The instance keys live on the control plane, outside every project folder:
//   <unaxis artifact dir>/../secrets-manager/keys.json
// ENCRYPTION_KEY there decrypts every secret Infisical stores — losing it
// loses them all, so the folder is added to the backup sources on deploy.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import { ARTIFACT_STORE_DIR } from "../config/stack.ts";
import { dbGetAllServices, dbGetEnvironments, dbGetHostFacts, dbGetServiceByKey, dbUpsertService } from "./control-db.ts";
import { dockerFetch } from "./agent-client.ts";
import { execIn } from "./forge-store.ts";
import { forgeHost, untarSingle } from "./forge.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";
import type { HostFacts } from "./media-topology.ts";
import {
  SECRETS_DEFAULTS as D,
  renderAppEnv,
  renderDbEnv,
  secretsConfig,
  siteUrl,
  validKeys,
  type SecretsConfig,
  type SecretsKeys,
} from "./secrets-manager.ts";

type Line = (l: string) => void;

export const SECRETS_MANAGER_DIR = join(dirname(ARTIFACT_STORE_DIR), "secrets-manager");
const DUMPS_DIR = join(SECRETS_MANAGER_DIR, "dumps");

export type SecretsPlacement = { key: string; env: UnaxisEnvironment; config: SecretsConfig; host: string | null };

export function getSecretsManager(): SecretsPlacement | null {
  const s = dbGetAllServices().find((x) => x.enabled && x.serviceType === "secrets" && x.environmentId);
  const env = s ? dbGetEnvironments().find((e) => e.id === s.environmentId) : undefined;
  if (!s || !env) return null;
  return { key: s.key, env, config: secretsConfig(s.config), host: forgeHost(dbGetHostFacts(env.id) as HostFacts, env.agentUrl) };
}

export function placeSecretsManager(env: UnaxisEnvironment, patch: Record<string, any> = {}): string {
  const current = dbGetAllServices().find((x) => x.serviceType === "secrets");
  const key = `secrets@${env.name.toLowerCase()}`;
  if (current && current.key !== key) dbUpsertService({ ...current, enabled: false, status: "moved" });
  const existing = dbGetServiceByKey(key);
  dbUpsertService({
    key,
    name: `Secrets manager on ${env.name}`,
    description: "Infisical — per-project, per-environment secrets with per-person access. Managed by `unaxis secrets`.",
    environmentId: env.id,
    serviceType: "secrets",
    container: D.app,
    config: { ...(current?.config ?? {}), ...patch },
    status: existing?.status ?? "unknown",
    enabled: true,
    sortOrder: 47,
  });
  return key;
}

/** Generated once; never regenerated (a new ENCRYPTION_KEY would orphan every stored secret). */
function instanceKeys(): SecretsKeys {
  const p = join(SECRETS_MANAGER_DIR, "keys.json");
  if (existsSync(p)) {
    const k = JSON.parse(readFileSync(p, "utf8"));
    if (!validKeys(k)) throw new Error(`${p} is malformed — restore it from backup; do not regenerate`);
    return k;
  }
  mkdirSync(SECRETS_MANAGER_DIR, { recursive: true });
  const k: SecretsKeys = {
    encryptionKey: randomBytes(16).toString("hex"),
    authSecret: randomBytes(32).toString("base64"),
    dbPassword: randomBytes(24).toString("base64url"),
  };
  writeFileSync(p, JSON.stringify(k, null, 2), { mode: 0o600 });
  return k;
}

// ── Agent helpers ────────────────────────────────────────────────────────────

async function pull(env: UnaxisEnvironment, image: string, onLine: Line): Promise<boolean> {
  const i = image.lastIndexOf(":");
  const r = await dockerFetch(env, `/images/create?fromImage=${encodeURIComponent(image.slice(0, i))}&tag=${encodeURIComponent(image.slice(i + 1))}`, {
    method: "POST", signal: AbortSignal.timeout(900_000),
  });
  const t = await r.text();
  if (!r.ok || /"error"/.test(t)) { onLine(`✗ pull ${image} failed: ${t.slice(-200)}`); return false; }
  return true;
}

async function exists(env: UnaxisEnvironment, path: string): Promise<boolean> {
  return (await dockerFetch(env, path)).ok;
}

async function createAndStart(env: UnaxisEnvironment, name: string, body: Record<string, any>, onLine: Line): Promise<string | null> {
  const r = await dockerFetch(env, `/containers/create?name=${name}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) { onLine(`✗ create ${name}: ${(await r.text()).slice(0, 300)}`); return null; }
  const { Id } = (await r.json()) as { Id: string };
  const s = await dockerFetch(env, `/containers/${Id}/start`, { method: "POST" });
  if (!s.ok && s.status !== 304) { onLine(`✗ start ${name} (${s.status})`); return null; }
  return Id;
}

const labels = (role: string) => ({ "unaxis.managed": "true", "unaxis.role": role });
const logCfg = { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } };

// ── Deploy ───────────────────────────────────────────────────────────────────

/**
 * Brings the three containers up on the placed host. Postgres and Redis are
 * created once and left running across redeploys (their data must survive);
 * migrations run in a one-off container; the app container is replaced.
 */
export async function deploySecretsManager(onLine: Line): Promise<number> {
  const s = getSecretsManager();
  if (!s) { onLine("✗ not placed — run: secrets place <env>"); return 1; }
  if (!s.env.agentUrl) { onLine(`✗ ${s.env.name} has no UNAXIS agent`); return 1; }
  if (!s.host && !s.config.siteUrl) { onLine(`✗ ${s.env.name}'s address is unknown — run: media facts ${s.env.name} --discover`); return 1; }
  const env = s.env;
  const keys = instanceKeys();
  const url = siteUrl(s.config, s.host ?? "");

  for (const img of [D.postgresImage, D.redisImage, s.config.image]) {
    onLine(`• pulling ${img} on ${env.name}…`);
    if (!(await pull(env, img, onLine))) return 1;
  }
  if (!(await exists(env, `/networks/${D.network}`))) {
    await dockerFetch(env, "/networks/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: D.network, Labels: labels("secrets") }),
    });
  }
  if (!(await exists(env, `/volumes/${D.dbVolume}`))) {
    await dockerFetch(env, "/volumes/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: D.dbVolume, Labels: labels("secrets") }),
    });
  }
  const net = { NetworkingConfig: { EndpointsConfig: { [D.network]: {} } } };

  if (!(await exists(env, `/containers/${D.db}/json`))) {
    onLine("• starting Postgres");
    if (!(await createAndStart(env, D.db, {
      Image: D.postgresImage, Env: renderDbEnv(keys), Labels: labels("secrets"),
      HostConfig: { Mounts: [{ Type: "volume", Source: D.dbVolume, Target: "/var/lib/postgresql/data" }], RestartPolicy: { Name: "unless-stopped" }, LogConfig: logCfg },
      ...net,
    }, onLine))) return 1;
  }
  if (!(await exists(env, `/containers/${D.redis}/json`))) {
    onLine("• starting Redis");
    if (!(await createAndStart(env, D.redis, {
      Image: D.redisImage, Labels: labels("secrets"),
      HostConfig: { RestartPolicy: { Name: "unless-stopped" }, LogConfig: logCfg }, ...net,
    }, onLine))) return 1;
  }

  onLine("• waiting for Postgres…");
  let ready = false;
  for (let i = 0; i < 30 && !ready; i++) {
    ready = (await execIn(env, D.db, ["pg_isready", "-U", "infisical"], "postgres", 15_000, "/")).code === 0;
    if (!ready) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ready) { onLine("✗ Postgres didn't become ready"); return 1; }

  // Migrations: a one-off container with the app's environment.
  onLine("• running database migrations…");
  const migName = `${D.app}_migrate`;
  await dockerFetch(env, `/containers/${migName}?force=true`, { method: "DELETE" });
  const mig = await createAndStart(env, migName, {
    Image: s.config.image, Cmd: ["npm", "run", "migration:latest"], Env: renderAppEnv(s.config, s.host ?? "", keys),
    Labels: labels("secrets"), HostConfig: { LogConfig: logCfg }, ...net,
  }, onLine);
  if (!mig) return 1;
  const wait = await dockerFetch(env, `/containers/${mig}/wait`, { method: "POST", signal: AbortSignal.timeout(600_000) });
  const { StatusCode } = (await wait.json()) as { StatusCode: number };
  if (StatusCode !== 0) {
    const logs = await dockerFetch(env, `/containers/${mig}/logs?stdout=true&stderr=true&tail=20`);
    onLine(`✗ migrations failed (exit ${StatusCode})`);
    Buffer.from(await logs.arrayBuffer()).toString("utf8").split("\n").slice(-12).forEach((l) => l.trim() && onLine(`  ${l.replace(/[\x00-\x08]/g, "").slice(0, 200)}`));
    return 1;
  }
  await dockerFetch(env, `/containers/${mig}?force=true`, { method: "DELETE" });

  if (await exists(env, `/containers/${D.app}/json`)) {
    onLine(`• replacing ${D.app} (data kept)`);
    await dockerFetch(env, `/containers/${D.app}?force=true`, { method: "DELETE" });
  }
  if (!(await createAndStart(env, D.app, {
    Image: s.config.image, Env: renderAppEnv(s.config, s.host ?? "", keys),
    Labels: { ...labels("secrets"), "unaxis.placement": s.key },
    ExposedPorts: { "8080/tcp": {} },
    HostConfig: {
      // LAN + tailnet only: nothing forwards this port from the internet.
      PortBindings: { "8080/tcp": [{ HostIp: "0.0.0.0", HostPort: String(s.config.httpPort) }] },
      RestartPolicy: { Name: "unless-stopped" }, Memory: 2 * 1024 * 1024 * 1024, LogConfig: logCfg,
    },
    ...net,
  }, onLine))) return 1;

  onLine(`• waiting for ${url}/api/status…`);
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) {
        dbUpsertService({ ...dbGetServiceByKey(s.key)!, status: "running", adminUrl: url, port: s.config.httpPort });
        onLine(`✓ secrets manager running on ${env.name}: ${url}`);
        onLine(`  keys: ${join(SECRETS_MANAGER_DIR, "keys.json")} (ENCRYPTION_KEY decrypts everything — keep a copy in your password manager)`);
        return 0;
      }
    } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 3000));
  }
  onLine(`✗ ${D.app} started but ${url} isn't answering — check: env logs ${env.name} ${D.app} --tail 60`);
  return 1;
}

// ── Status + database dump ───────────────────────────────────────────────────

export async function secretsStatus(onLine: Line): Promise<number> {
  const s = getSecretsManager();
  if (!s) { onLine("secrets manager: not placed — run: secrets place <env>"); return 1; }
  const url = siteUrl(s.config, s.host ?? "?");
  onLine(`secrets manager  ${s.key}  →  ${url}`);
  for (const c of [D.app, D.db, D.redis]) {
    const r = s.env.agentUrl ? await dockerFetch(s.env, `/containers/${c}/json`).catch(() => null) : null;
    const st = r?.ok ? ((await r.json()) as { State: { Status: string } }).State.Status : "not found";
    onLine(`  ${c.padEnd(18)} ${st}`);
  }
  let up = false;
  try { up = (await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(4000) })).ok; } catch {}
  onLine(`  web                ${up ? "answering" : "not answering"}`);
  const dumps = existsSync(DUMPS_DIR) ? readdirSync(DUMPS_DIR).filter((f) => f.endsWith(".dump")).sort() : [];
  onLine(`  db dumps           ${dumps.length}${dumps.length ? ` (newest ${dumps.at(-1)})` : ""} in ${DUMPS_DIR}`);
  return 0;
}

/**
 * pg_dump of Infisical's database into the secrets-manager folder (which the
 * restic backup carries). Run before every backup. Keeps the newest 14.
 */
export async function dumpSecretsDb(onLine: Line): Promise<number> {
  const s = getSecretsManager();
  if (!s?.env.agentUrl) return 0;
  const name = `infisical-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.dump`;
  const d = await execIn(s.env, D.db, ["pg_dump", "-U", "infisical", "-Fc", "-f", `/tmp/${name}`, "infisical"], "postgres", 300_000, "/");
  if (d.code !== 0) { onLine(`⚠ secrets db dump failed: ${d.output.trim().slice(-200)}`); return 1; }
  const arch = await dockerFetch(s.env, `/containers/${D.db}/archive?path=${encodeURIComponent(`/tmp/${name}`)}`);
  const file = arch.ok ? untarSingle(Buffer.from(await arch.arrayBuffer())) : null;
  await execIn(s.env, D.db, ["rm", "-f", `/tmp/${name}`], "postgres", 30_000, "/");
  if (!file) { onLine("⚠ secrets db dump couldn't be copied off the host"); return 1; }
  mkdirSync(DUMPS_DIR, { recursive: true });
  writeFileSync(join(DUMPS_DIR, name), file.data);
  const all = readdirSync(DUMPS_DIR).filter((f) => /^infisical-\d{8}T\d{6}Z\.dump$/.test(f)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 14))) rmSync(join(DUMPS_DIR, old));
  onLine(`✓ secrets db dumped (${(file.data.length / 1024).toFixed(0)} KB) → ${name}`);
  return 0;
}

