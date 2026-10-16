// src/ink/object-store-store.ts
// The object store (Garage) on a UNAXIS host, and Postgres's continuous
// archive into it (WAL-G). See object-store.ts for the why.
//
//   data place <env>          where the object store runs (a placed service)
//   data deploy               pull + run Garage there, init layout/bucket/key
//   data archive setup        write WAL-G's config into the db and take a base
//                             backup now (no restart, nothing changes for Postgres)
//   data archive enable       ALTER SYSTEM archive_mode/command/timeout —
//                             takes effect on the next Postgres restart
//   data status               object store + archiver + base backups

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { randomBytes } from "crypto";
import { dirname, join } from "path";
import { ARTIFACT_STORE_DIR } from "../config/stack.ts";
import { dbGetAllServices, dbGetEnvironments, dbGetHostFacts, dbGetServiceByKey, dbUpsertService } from "./control-db.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";
import type { HostFacts } from "./media-topology.ts";
import { dockerFetch } from "./agent-client.ts";
import { execIn } from "./forge-store.ts";
import { forgeHost, tarSingle } from "./forge.ts";
import {
  OBJECTS_DEFAULTS as D,
  archiveSettings,
  parseKeyCreate,
  parseNodeId,
  renderGarageToml,
  renderWalgConfig,
  type ObjectStoreKeys,
} from "./object-store.ts";

type Line = (l: string) => void;

const KEYS_DIR = join(dirname(ARTIFACT_STORE_DIR), "objects");
const KEYS_FILE = join(KEYS_DIR, "keys.json");
const DB_CONTAINER = "unt_db";
const PGDATA = "/var/lib/postgresql/data";
const WALG_CONFIG = `${PGDATA}/walg.json`;
const WAL_PREFIX = "unenter";

// CLI output without colour codes or Garage's own log lines (which mention node ids).
const clean = (s: string) => s
  .replace(/\x1b\[[0-9;]*m/g, "")
  .split("\n").filter((l) => !/^\s*\d{4}-\d\d-\d\dT\S+\s+(TRACE|DEBUG|INFO|WARN)\b/.test(l)).join("\n")
  .replace(/[^\x20-\x7e\n]/g, "").trim();

function loadKeys(): ObjectStoreKeys {
  if (existsSync(KEYS_FILE)) return JSON.parse(readFileSync(KEYS_FILE, "utf8"));
  const k: ObjectStoreKeys = { rpcSecret: randomBytes(32).toString("hex"), adminToken: randomBytes(32).toString("base64url") };
  saveKeys(k);
  return k;
}
function saveKeys(k: ObjectStoreKeys): void {
  mkdirSync(KEYS_DIR, { recursive: true });
  writeFileSync(KEYS_FILE, JSON.stringify(k, null, 2) + "\n", { mode: 0o600 });
}

export type ObjectStorePlacement = { key: string; env: UnaxisEnvironment; host: string | null };

export function getObjectStore(): ObjectStorePlacement | null {
  const s = dbGetAllServices().find((x) => x.enabled && x.serviceType === "objects" && x.environmentId);
  const env = s ? dbGetEnvironments().find((e) => e.id === s.environmentId) : undefined;
  if (!s || !env) return null;
  return { key: s.key, env, host: forgeHost(dbGetHostFacts(env.id) as HostFacts, env.agentUrl) };
}

export function placeObjectStore(env: UnaxisEnvironment): string {
  const current = dbGetAllServices().find((x) => x.serviceType === "objects");
  const key = `objects@${env.name.toLowerCase()}`;
  if (current && current.key !== key) dbUpsertService({ ...current, enabled: false, status: "moved" });
  const existing = dbGetServiceByKey(key);
  dbUpsertService({
    key,
    name: `Object store on ${env.name}`,
    description: "Garage (S3-compatible) — live copies of production data: Postgres WAL + base backups. Managed by `unaxis data`.",
    environmentId: env.id,
    serviceType: "objects",
    container: D.container,
    config: { ...(current?.config ?? {}) },
    status: existing?.status ?? "unknown",
    enabled: true,
    sortOrder: 48,
  });
  return key;
}

const garage = (p: ObjectStorePlacement, args: string[], timeoutMs = 60_000) =>
  // uid 0: the image is scratch, there is no /etc/passwd to resolve "root".
  execIn(p.env, D.container, ["/garage", ...args], "0", timeoutMs, "/");

export async function deployObjectStore(onLine: Line): Promise<number> {
  const p = getObjectStore();
  if (!p?.env.agentUrl) { onLine("✗ not placed — run: data place <env>"); return 1; }
  const env = p.env;
  const keys = loadKeys();
  const [repo, tag] = D.image.split(":");

  onLine(`• pulling ${D.image} on ${env.name}…`);
  const pull = await dockerFetch(env, `/images/create?fromImage=${repo}&tag=${tag}`, { method: "POST", signal: AbortSignal.timeout(300_000) });
  const pullText = await pull.text();
  if (!pull.ok || /"error"/.test(pullText)) { onLine(`✗ pull failed: ${pullText.slice(-200)}`); return 1; }

  if (!(await dockerFetch(env, `/volumes/${D.volume}`)).ok) {
    await dockerFetch(env, "/volumes/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: D.volume, Labels: { "unaxis.managed": "true", "unaxis.role": "objects" } }),
    });
  }
  if ((await dockerFetch(env, `/containers/${D.container}/json`)).ok) {
    onLine(`• replacing ${D.container} (data volume kept)`);
    await dockerFetch(env, `/containers/${D.container}?force=true`, { method: "DELETE" });
  }
  const create = await dockerFetch(env, `/containers/create?name=${D.container}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Image: D.image,
      Labels: { "unaxis.managed": "true", "unaxis.role": "objects" },
      ExposedPorts: { [`${D.s3Port}/tcp`]: {} },
      HostConfig: {
        // S3 only, LAN + tailnet; RPC and admin stay inside the container.
        PortBindings: { [`${D.s3Port}/tcp`]: [{ HostIp: "0.0.0.0", HostPort: String(D.s3Port) }] },
        Mounts: [{ Type: "volume", Source: D.volume, Target: "/var/lib/garage" }],
        RestartPolicy: { Name: "unless-stopped" },
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    }),
  });
  if (!create.ok) { onLine(`✗ create failed: ${(await create.text()).slice(0, 300)}`); return 1; }
  const { Id } = (await create.json()) as { Id: string };
  // Garage reads /etc/garage.toml; put it there before the first start.
  const put = await dockerFetch(env, `/containers/${Id}/archive?path=/etc`, {
    method: "PUT", headers: { "Content-Type": "application/x-tar" }, body: tarSingle("garage.toml", Buffer.from(renderGarageToml(keys))),
  });
  if (!put.ok) { onLine(`✗ config upload failed (${put.status})`); return 1; }
  const start = await dockerFetch(env, `/containers/${Id}/start`, { method: "POST" });
  if (!start.ok && start.status !== 304) { onLine(`✗ start failed (${start.status})`); return 1; }

  // Wait for the node, then lay out a single-node cluster once.
  let nodeId: string | null = null;
  let last = "";
  for (let i = 0; i < 30 && !nodeId; i++) {
    last = clean((await garage(p, ["node", "id", "-q"])).output);
    nodeId = parseNodeId(last);
    if (!nodeId) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!nodeId) { onLine(`✗ garage didn't come up: ${last.slice(-200)}`); return 1; }
  const layout = clean((await garage(p, ["layout", "show"])).output);
  // Only the CURRENT layout counts (a staged-but-unapplied role also lists the node).
  const current = layout.split(/==== STAGED/i)[0];
  if (!current.includes(nodeId.slice(0, 16))) {
    await garage(p, ["layout", "assign", "-z", env.name.toLowerCase(), "-c", D.capacity, nodeId]);
    const v = /Current cluster layout version:\s*(\d+)/i.exec(layout)?.[1];
    const apply = await garage(p, ["layout", "apply", "--version", String(Number(v ?? 0) + 1)]);
    if (apply.code !== 0) { onLine(`✗ layout apply failed: ${clean(apply.output).slice(-200)}`); return 1; }
    onLine(`✓ layout: ${env.name} node ${nodeId.slice(0, 12)}… (${D.capacity})`);
  }

  await garage(p, ["bucket", "create", D.walBucket]); // fine if it exists
  if (!keys.walKeyId) {
    const out = clean((await garage(p, ["key", "create", D.walKeyName])).output);
    const k = parseKeyCreate(out);
    if (!k) { onLine(`✗ couldn't create the WAL-G access key: ${out.replace(/Secret key:.*/i, "").slice(-300)}`); return 1; }
    saveKeys({ ...keys, walKeyId: k.keyId, walSecret: k.secret });
  }
  const walKey = loadKeys().walKeyId!;
  const allow = await garage(p, ["bucket", "allow", "--read", "--write", "--owner", D.walBucket, "--key", walKey]);
  if (allow.code !== 0) { onLine(`✗ bucket permission failed: ${clean(allow.output).slice(-200)}`); return 1; }

  onLine(`✓ object store on ${env.name}: s3 http://${p.host ?? "?"}:${D.s3Port} (bucket ${D.walBucket})`);
  onLine(`  keys: ${KEYS_FILE} — keep a copy in your password manager`);
  return 0;
}

/** The host Postgres runs on (the core stack's environment). */
function dbEnv(): UnaxisEnvironment | null {
  const envs = dbGetEnvironments();
  return envs.find((e) => e.type === "local-docker" && e.agentUrl) ?? envs.find((e) => e.isDefaultTarget && e.agentUrl) ?? null;
}

const psql = (env: UnaxisEnvironment, sql: string) =>
  execIn(env, DB_CONTAINER, ["psql", "-h", "127.0.0.1", "-U", "supabase_admin", "-d", "postgres", "-At", "-c", sql], "postgres", 60_000, "/");

/** Writes WAL-G's config into the db's data dir and takes a base backup now. No restart. */
export async function setupPgArchive(onLine: Line): Promise<number> {
  const store = getObjectStore();
  const db = dbEnv();
  const keys = existsSync(KEYS_FILE) ? loadKeys() : null;
  if (!store?.host || !keys?.walKeyId || !keys.walSecret) { onLine("✗ deploy the object store first: data place <env> && data deploy"); return 1; }
  if (!db) { onLine("✗ no environment runs the database"); return 1; }

  const cfg = renderWalgConfig({ endpoint: `http://${store.host}:${D.s3Port}`, keyId: keys.walKeyId, secret: keys.walSecret, prefix: WAL_PREFIX });
  const put = await dockerFetch(db, `/containers/${DB_CONTAINER}/archive?path=${encodeURIComponent(PGDATA)}`, {
    method: "PUT", headers: { "Content-Type": "application/x-tar" }, body: tarSingle("walg.json", Buffer.from(cfg)),
  });
  if (!put.ok) { onLine(`✗ couldn't write ${WALG_CONFIG} (${put.status})`); return 1; }
  await execIn(db, DB_CONTAINER, ["sh", "-c", `chown postgres:postgres ${WALG_CONFIG} && chmod 600 ${WALG_CONFIG}`], "root", 30_000, "/");
  onLine(`✓ WAL-G config in ${DB_CONTAINER}:${WALG_CONFIG} → s3 ${store.env.name}`);

  onLine("• base backup (wal-g backup-push)…");
  const b = await execIn(db, DB_CONTAINER, ["/usr/local/bin/wal-g", "--config", WALG_CONFIG, "backup-push", PGDATA], "postgres", 1_800_000, "/");
  const out = clean(b.output);
  if (b.code !== 0) { onLine(`✗ base backup failed: ${out.split("\n").slice(-3).join(" | ")}`); return 1; }
  onLine(`✓ base backup done: ${/Wrote backup with name (\S+)/.exec(out)?.[1] ?? "ok"}`);
  return 0;
}

/** Turns archiving on (ALTER SYSTEM). archive_mode only takes effect after a Postgres restart. */
export async function enablePgArchive(onLine: Line): Promise<number> {
  const db = dbEnv();
  if (!db) { onLine("✗ no environment runs the database"); return 1; }
  for (const [name, value] of archiveSettings(WALG_CONFIG)) {
    const r = await psql(db, `ALTER SYSTEM SET ${name} = '${value.replace(/'/g, "''")}'`);
    if (r.code !== 0) { onLine(`✗ ${name}: ${clean(r.output).slice(-200)}`); return 1; }
  }
  await psql(db, "SELECT pg_reload_conf()");
  const mode = clean((await psql(db, "SHOW archive_mode")).output);
  onLine(`✓ archive settings written (archive_command + archive_timeout live now; archive_mode is "${mode}")`);
  if (mode !== "on") onLine(`  archive_mode turns on at the next Postgres restart (docker restart ${DB_CONTAINER}) — ~10–30 s of downtime for every site`);
  return 0;
}

export async function dataStatus(onLine: Line): Promise<number> {
  const store = getObjectStore();
  onLine(`object store   ${store ? `${store.key} → http://${store.host ?? "?"}:${D.s3Port}` : "not placed — data place <env>"}`);
  if (store?.env.agentUrl) {
    const st = await dockerFetch(store.env, `/containers/${D.container}/json`).catch(() => null);
    onLine(`  ${D.container}      ${st?.ok ? ((await st.json()) as any).State.Status : "not found"}`);
  }
  const db = dbEnv();
  if (!db) return 0;
  const a = clean((await psql(db, "SELECT current_setting('archive_mode') || '|' || coalesce(last_archived_wal,'-') || '|' || coalesce(last_archived_time::text,'-') || '|' || failed_count || '|' || coalesce(last_failed_time::text,'-') FROM pg_stat_archiver")).output);
  const [mode, lastWal, lastAt, failed, lastFail] = a.split("\n").pop()!.split("|");
  onLine(`postgres       archive_mode=${mode}  last archived ${lastWal} at ${lastAt}  failures ${failed}${failed !== "0" ? ` (last ${lastFail})` : ""}`);
  if (existsSync(KEYS_FILE)) {
    const list = await execIn(db, DB_CONTAINER, ["/usr/local/bin/wal-g", "--config", WALG_CONFIG, "backup-list"], "postgres", 60_000, "/");
    const rows = clean(list.output).split("\n").filter((l) => /^base_/.test(l));
    onLine(`base backups   ${rows.length}${rows.length ? ` (newest ${rows.at(-1)!.split(/\s+/)[0]})` : ""}`);
  }
  return 0;
}

/** Nightly: a fresh base backup so restores replay at most a day of WAL. */
export async function nightlyBaseBackup(onLine: Line): Promise<void> {
  const db = dbEnv();
  if (!db || !getObjectStore() || !existsSync(KEYS_FILE)) return;
  const b = await execIn(db, DB_CONTAINER, ["/usr/local/bin/wal-g", "--config", WALG_CONFIG, "backup-push", PGDATA], "postgres", 1_800_000, "/");
  onLine(b.code === 0 ? "✓ postgres base backup → object store" : `⚠ postgres base backup failed: ${clean(b.output).split("\n").pop()}`);
}
