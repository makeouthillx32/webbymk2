// src/ink/forge-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Side-effecting half of forge.ts: placing the forge on a UNAXIS host, deploying
// it through that host's agent, and taking dumps that land in three places
// (the forge's own volume, plus every configured backup directory on the
// control-plane host). Nothing here assumes which machine the forge is on.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { dbGetEnvironments, dbGetHostFacts, dbGetAllServices, dbGetServiceByKey, dbUpsertService } from "./control-db.ts";
import { dockerFetch } from "./agent-client.ts";
import type { UnaxisEnvironment } from "./environment-store.ts";
import type { HostFacts } from "./media-topology.ts";
import {
  FORGE_DEFAULTS,
  dumpFileName,
  forgeConfig,
  forgeHost,
  forgeRootUrl,
  parseBackupTarget,
  prunePlan,
  renderForgeEnv,
  tarSingle,
  untarSingle,
  type ForgeConfig,
} from "./forge.ts";

type Line = (l: string) => void;

export type ForgePlacement = { key: string; env: UnaxisEnvironment; config: ForgeConfig; host: string | null };

export function getForge(): ForgePlacement | null {
  const s = dbGetAllServices().find((x) => x.enabled && x.serviceType === "forge" && x.environmentId);
  if (!s) return null;
  const env = dbGetEnvironments().find((e) => e.id === s.environmentId);
  if (!env) return null;
  const facts = dbGetHostFacts(env.id) as HostFacts;
  return { key: s.key, env, config: forgeConfig(s.config), host: forgeHost(facts, env.agentUrl) };
}

/** Records where the forge runs. One forge per control plane; placing it again moves the record. */
export function placeForge(env: UnaxisEnvironment, patch: Record<string, any> = {}): string {
  const current = dbGetAllServices().find((x) => x.serviceType === "forge");
  const key = `forge@${env.name.toLowerCase()}`;
  const merged = { ...(current?.config ?? {}), ...patch };
  if (current && current.key !== key) {
    dbUpsertService({ ...current, enabled: false, status: "moved" });
  }
  const existing = dbGetServiceByKey(key);
  dbUpsertService({
    key,
    name: `Git forge on ${env.name}`,
    description: "Forgejo — source of truth for code. Managed by `unaxis forge`.",
    environmentId: env.id,
    serviceType: "forge",
    container: forgeConfig(merged).container,
    config: merged,
    status: existing?.status ?? "unknown",
    enabled: true,
    sortOrder: 45,
  });
  return key;
}

export function patchForge(patch: Record<string, any>): boolean {
  const f = getForge();
  if (!f) return false;
  const s = dbGetServiceByKey(f.key)!;
  dbUpsertService({ ...s, config: { ...s.config, ...patch } });
  return true;
}

// ── Docker helpers (through the host's agent) ───────────────────────────────

/** Docker's multiplexed stdout/stderr stream (Tty off) → text. */
function demux(buf: Buffer): string {
  let out = "";
  let i = 0;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i + 4);
    out += buf.subarray(i + 8, i + 8 + len).toString("utf8");
    i += 8 + len;
  }
  return out || buf.toString("utf8");
}

async function execIn(env: UnaxisEnvironment, container: string, cmd: string[], user = "git", timeoutMs = 600_000): Promise<{ code: number; output: string }> {
  const create = await dockerFetch(env, `/containers/${container}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Cmd: cmd, User: user, WorkingDir: "/data", AttachStdout: true, AttachStderr: true }),
  });
  if (!create.ok) return { code: -1, output: `exec create failed (${create.status}): ${(await create.text()).slice(0, 200)}` };
  const { Id } = (await create.json()) as { Id: string };
  const start = await dockerFetch(env, `/exec/${Id}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ Detach: false, Tty: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const output = demux(Buffer.from(await start.arrayBuffer()));
  const inspect = await dockerFetch(env, `/exec/${Id}/json`);
  const code = inspect.ok ? Number(((await inspect.json()) as { ExitCode: number | null }).ExitCode ?? -1) : -1;
  return { code, output };
}

async function containerState(env: UnaxisEnvironment, name: string): Promise<{ running: boolean; status: string; image: string } | null> {
  const r = await dockerFetch(env, `/containers/${name}/json`);
  if (!r.ok) return null;
  const j = (await r.json()) as { State: { Running: boolean; Status: string }; Config: { Image: string } };
  return { running: j.State.Running, status: j.State.Status, image: j.Config.Image };
}

async function healthy(url: string, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${url}api/healthz`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ── Deploy ───────────────────────────────────────────────────────────────────

/**
 * (Re)creates the forge container on its placed host. The data volume is
 * never touched here, so a redeploy (new image, new settings) keeps every repo.
 */
export async function deployForge(onLine: Line): Promise<number> {
  const f = getForge();
  if (!f) { onLine("✗ no forge placed — run: forge place <env>"); return 1; }
  if (!f.env.agentUrl) { onLine(`✗ ${f.env.name} has no UNAXIS agent`); return 1; }
  if (!f.host && !f.config.rootUrl) {
    onLine(`✗ don't know ${f.env.name}'s address — run: media facts ${f.env.name} --discover (or set --root-url)`);
    return 1;
  }
  const c = f.config;
  const root = forgeRootUrl(c, f.host ?? "");

  onLine(`• pulling ${c.image} on ${f.env.name}…`);
  const colon = c.image.lastIndexOf(":");
  const [repo, tag] = colon > c.image.indexOf("/") ? [c.image.slice(0, colon), c.image.slice(colon + 1)] : [c.image, "latest"];
  const pull = await dockerFetch(f.env, `/images/create?fromImage=${encodeURIComponent(repo)}&tag=${encodeURIComponent(tag)}`, {
    method: "POST", signal: AbortSignal.timeout(600_000),
  });
  const pullText = await pull.text();
  if (!pull.ok || /"error"/.test(pullText)) { onLine(`✗ image pull failed: ${pullText.slice(-200)}`); return 1; }

  const vol = await dockerFetch(f.env, `/volumes/${c.volume}`);
  if (!vol.ok) {
    const mk = await dockerFetch(f.env, "/volumes/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: c.volume, Labels: { "unaxis.managed": "true", "unaxis.role": "forge" } }),
    });
    if (!mk.ok) { onLine(`✗ volume create failed (${mk.status})`); return 1; }
    onLine(`• created volume ${c.volume}`);
  }

  if (await containerState(f.env, c.container)) {
    onLine(`• replacing ${c.container} (data volume kept)`);
    await dockerFetch(f.env, `/containers/${c.container}?force=true`, { method: "DELETE" });
  }

  const create = await dockerFetch(f.env, `/containers/create?name=${encodeURIComponent(c.container)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Image: c.image,
      Env: renderForgeEnv(c, f.host ?? ""),
      Labels: { "unaxis.managed": "true", "unaxis.role": "forge", "unaxis.placement": f.key },
      ExposedPorts: { "3000/tcp": {}, "22/tcp": {} },
      HostConfig: {
        // Published on the host only; nothing forwards these from the internet.
        PortBindings: {
          "3000/tcp": [{ HostIp: "0.0.0.0", HostPort: String(c.httpPort) }],
          "22/tcp": [{ HostIp: "0.0.0.0", HostPort: String(c.sshPort) }],
        },
        Mounts: [{ Type: "volume", Source: c.volume, Target: "/data" }],
        RestartPolicy: { Name: "unless-stopped" },
        Memory: 1024 * 1024 * 1024,
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    }),
  });
  if (!create.ok) { onLine(`✗ create failed: ${(await create.text()).slice(0, 300)}`); return 1; }
  const { Id } = (await create.json()) as { Id: string };
  const start = await dockerFetch(f.env, `/containers/${Id}/start`, { method: "POST" });
  if (!start.ok && start.status !== 304) { onLine(`✗ start failed (${start.status})`); return 1; }

  onLine(`• waiting for ${root}api/healthz…`);
  if (!(await healthy(root, 90_000))) {
    onLine(`✗ ${c.container} started but ${root} is not answering — check: env logs ${f.env.name} ${c.container} --tail 60`);
    return 1;
  }
  const s = dbGetServiceByKey(f.key)!;
  dbUpsertService({ ...s, status: "running", adminUrl: root, port: c.httpPort });
  onLine(`✓ forge running on ${f.env.name}: ${root}  (ssh port ${c.sshPort})`);
  return 0;
}

// ── Status ───────────────────────────────────────────────────────────────────

async function listDumpsIn(env: UnaxisEnvironment, container: string): Promise<string[]> {
  const ls = await execIn(env, container, ["sh", "-c", "ls -1 /data/dumps 2>/dev/null"], "git", 20_000);
  return prunePlan(ls.output.split("\n").map((s) => s.trim()), 0);
}

export async function forgeStatus(onLine: Line): Promise<number> {
  const f = getForge();
  if (!f) { onLine("forge: not placed — run: forge place <env>"); return 1; }
  const c = f.config;
  const root = forgeRootUrl(c, f.host ?? "?");
  const st = f.env.agentUrl ? await containerState(f.env, c.container).catch(() => null) : null;
  onLine(`forge  ${f.key}  →  ${root}`);
  onLine(`  container  ${c.container}: ${st ? `${st.status} (${st.image})` : "not found"}`);
  onLine(`  web        ${(await healthy(root, 1)) ? "answering" : "not answering"}`);
  onLine(`  ssh        ssh://git@${new URL(root).hostname}:${c.sshPort}/<owner>/<repo>.git`);
  if (st?.running) {
    const dumps = await listDumpsIn(f.env, c.container);
    onLine(`  backups    ${f.env.name} volume: ${dumps.length}${dumps.length ? ` (newest ${dumps.at(-1)})` : ""}`);
  }
  for (const raw of c.backupTargets) {
    const t = parseBackupTarget(raw);
    if (typeof t === "string") { onLine(`             ${raw}: invalid (${t})`); continue; }
    if (t.kind === "dir") {
      const n = existsSync(t.path) ? prunePlan(readdirSync(t.path), 0).length : -1;
      onLine(`             ${t.path}: ${n < 0 ? "missing" : `${n} dump(s)`}`);
    } else {
      onLine(`             env:${t.env} (volume ${FORGE_DEFAULTS.sinkVolume})`);
    }
  }
  if (c.backupTargets.length < 2) {
    onLine(`  ⚠ ${1 + c.backupTargets.length} of 3 copies — add: forge backup-target add <dir | env:NAME>`);
  }
  return 0;
}

// ── Backup ───────────────────────────────────────────────────────────────────

/** Writes one dump into the sink volume on another UNAXIS host and prunes old ones there. */
async function copyToEnv(envName: string, name: string, data: Buffer, keep: number): Promise<string> {
  const env = dbGetEnvironments().find((e) => e.name.toLowerCase() === envName.toLowerCase());
  if (!env?.agentUrl) throw new Error(`no UNAXIS host "${envName}" with an agent`);
  const [repo, tag] = FORGE_DEFAULTS.sinkImage.split(":");
  const pull = await dockerFetch(env, `/images/create?fromImage=${repo}&tag=${tag}`, { method: "POST", signal: AbortSignal.timeout(300_000) });
  const pullText = await pull.text();
  if (!pull.ok || /"error"/.test(pullText)) throw new Error(`pull ${FORGE_DEFAULTS.sinkImage} failed on ${env.name}`);

  const create = await dockerFetch(env, "/containers/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Image: FORGE_DEFAULTS.sinkImage,
      // Runs after the upload: prune, then report the new file's size.
      Cmd: ["sh", "-c", `cd /backups && ls -1 forge-*.tar.gz | sort | head -n -${keep} | xargs -r rm -f; stat -c %s ${name}`],
      Labels: { "unaxis.managed": "true", "unaxis.role": "forge-backup" },
      HostConfig: { Mounts: [{ Type: "volume", Source: FORGE_DEFAULTS.sinkVolume, Target: "/backups" }], AutoRemove: false },
    }),
  });
  if (!create.ok) throw new Error(`create failed on ${env.name} (${create.status})`);
  const { Id } = (await create.json()) as { Id: string };
  try {
    const put = await dockerFetch(env, `/containers/${Id}/archive?path=/backups`, {
      method: "PUT", headers: { "Content-Type": "application/x-tar" }, body: tarSingle(name, data),
      signal: AbortSignal.timeout(600_000),
    });
    if (!put.ok) throw new Error(`upload failed on ${env.name} (${put.status})`);
    const start = await dockerFetch(env, `/containers/${Id}/start`, { method: "POST" });
    if (!start.ok) throw new Error(`start failed on ${env.name} (${start.status})`);
    await dockerFetch(env, `/containers/${Id}/wait`, { method: "POST", signal: AbortSignal.timeout(120_000) });
    const logs = await dockerFetch(env, `/containers/${Id}/logs?stdout=true&stderr=true`);
    const size = Number(demux(Buffer.from(await logs.arrayBuffer())).trim().split("\n").pop());
    if (size !== data.length) throw new Error(`${env.name} holds ${size} of ${data.length} bytes`);
    return env.name;
  } finally {
    await dockerFetch(env, `/containers/${Id}?force=true`, { method: "DELETE" }).catch(() => {});
  }
}

/**
 * `forgejo dump` inside the container (copy #1, in its volume), then the same
 * file copied to every backup target (copies #2..n): directories on the
 * control-plane host, or volumes on other UNAXIS hosts. Old dumps are pruned
 * in each place independently.
 */
export async function backupForge(onLine: Line): Promise<number> {
  const f = getForge();
  if (!f) { onLine("✗ no forge placed"); return 1; }
  const c = f.config;
  const st = await containerState(f.env, c.container);
  if (!st?.running) { onLine(`✗ ${c.container} is not running on ${f.env.name}`); return 1; }

  // /data belongs to root; the dump folder sits beside (not inside) Forgejo's
  // data dir so dumps never contain earlier dumps.
  // A fresh forge has no repositories folder yet, and dump refuses to run without one.
  await execIn(f.env, c.container, [
    "sh", "-c", "mkdir -p /data/dumps /data/git/repositories && chown git:git /data/dumps /data/git/repositories",
  ], "root", 20_000);

  const name = dumpFileName(new Date());
  onLine(`• dumping on ${f.env.name} → /data/dumps/${name}`);
  const dump = await execIn(f.env, c.container, [
    "forgejo", "dump", "-c", "/data/gitea/conf/app.ini", "--type", "tar.gz", "--tempdir", "/tmp", "--file", `/data/dumps/${name}`,
  ]);
  if (dump.code !== 0) {
    await execIn(f.env, c.container, ["rm", "-f", `/data/dumps/${name}`], "git", 20_000);
    onLine(`✗ forgejo dump failed (exit ${dump.code})`);
    dump.output.trim().split("\n").slice(-8).forEach((l) => onLine(`  ${l}`));
    return 1;
  }

  let failures = 0;
  if (c.backupTargets.length > 0) {
    const arch = await dockerFetch(f.env, `/containers/${c.container}/archive?path=${encodeURIComponent(`/data/dumps/${name}`)}`, {
      signal: AbortSignal.timeout(600_000),
    });
    const file = arch.ok ? untarSingle(Buffer.from(await arch.arrayBuffer())) : null;
    if (!file) { onLine(`✗ could not copy the dump off ${f.env.name} (${arch.status})`); return 1; }
    const mb = (file.data.length / 1e6).toFixed(1);
    for (const raw of c.backupTargets) {
      const t = parseBackupTarget(raw);
      try {
        if (typeof t === "string") throw new Error(t);
        if (t.kind === "dir") {
          mkdirSync(t.path, { recursive: true });
          writeFileSync(join(t.path, name), file.data);
          const size = statSync(join(t.path, name)).size;
          if (size !== file.data.length) throw new Error(`wrote ${size} of ${file.data.length} bytes`);
          for (const old of prunePlan(readdirSync(t.path), c.keepPerDir)) rmSync(join(t.path, old));
          onLine(`✓ copied to ${t.path} (${mb} MB)`);
        } else {
          const host = await copyToEnv(t.env, name, file.data, c.keepPerDir);
          onLine(`✓ copied to ${host}:${FORGE_DEFAULTS.sinkVolume} (${mb} MB)`);
        }
      } catch (e) {
        failures++;
        onLine(`✗ ${raw}: ${e instanceof Error ? e.message : e}`);
      }
    }
  } else {
    onLine("⚠ only one copy exists (in the forge's volume) — add: forge backup-target add <dir | env:NAME>");
  }

  const drop = prunePlan(await listDumpsIn(f.env, c.container), c.keepInVolume);
  if (drop.length) await execIn(f.env, c.container, ["rm", "-f", ...drop.map((n) => `/data/dumps/${n}`)], "git", 60_000);

  onLine(failures ? `✗ backup ${name}: ${failures} target(s) failed` : `✓ backup ${name}: ${1 + c.backupTargets.length} copies`);
  return failures ? 1 : 0;
}
