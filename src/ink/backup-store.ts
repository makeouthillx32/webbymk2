// src/ink/backup-store.ts
// ─────────────────────────────────────────────────────────────────────────────
// Side-effecting half of backup.ts: config in the control DB, the two backup
// secrets on the control-plane host, rest-server deployment on any UNAXIS
// host (through its agent), and restic runs in a throwaway container on the
// control plane with the sources mounted read-only.
//
// Secrets live outside every backed-up folder, in the UNAXIS artifact dir:
//   backup/repo-password   — encrypts every repository (lose it = lose backups)
//   backup/rest-password   — rest-server login for the `unaxis` user
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { randomBytes } from "crypto";
import { spawn } from "child_process";
import { ARTIFACT_STORE_DIR } from "../config/stack.ts";
import { dbGetEnvironments, dbGetHostFacts, dbGetServiceByKey, dbUpsertService } from "./control-db.ts";
import { dockerFetch } from "./agent-client.ts";
import { DOCKER_ENV } from "./utils/dockerEnv.ts";
import { execIn } from "./forge-store.ts";
import { forgeHost, parseBackupTarget } from "./forge.ts";
import type { HostFacts } from "./media-topology.ts";
import {
  BACKUP_DEFAULTS,
  backupArgs,
  backupConfig,
  isDue,
  repoUrl,
  type BackupConfig,
  type BackupTarget,
} from "./backup.ts";

type Line = (l: string) => void;
const KEY = "backup";

// ── Config + secrets ─────────────────────────────────────────────────────────

export function loadBackupConfig(): BackupConfig {
  return backupConfig(dbGetServiceByKey(KEY)?.config ?? {});
}

export function saveBackupConfig(cfg: BackupConfig): void {
  dbUpsertService({
    key: KEY,
    name: "Workspace backups (restic)",
    description: "Encrypted, versioned snapshots of the dev drive. Managed by `unaxis backup`.",
    serviceType: "utility",
    config: cfg,
    status: cfg.lastRun ? (cfg.lastRun.ok ? "ok" : "failed") : "unknown",
    enabled: true,
    sortOrder: 46,
  });
}

export const SECRETS_DIR = join(dirname(ARTIFACT_STORE_DIR), "backup");

function secret(name: "repo-password" | "rest-password"): string {
  const p = join(SECRETS_DIR, name);
  if (!existsSync(p)) {
    mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(p, randomBytes(32).toString("base64url"), { mode: 0o600 });
  }
  return readFileSync(p, "utf8").trim();
}

function envByName(name: string) {
  return dbGetEnvironments().find((e) => e.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function targetHost(t: BackupTarget): string | null {
  if (t.kind !== "env") return null;
  const env = envByName(t.env);
  return env ? forgeHost(dbGetHostFacts(env.id) as HostFacts, env.agentUrl) : null;
}

// ── Local docker (the restic client runs next to the data) ───────────────────

/** A stored path in the form the docker CLI on this side expects (Windows ↔ WSL). */
export function nativePath(p: string): string {
  const t = parseBackupTarget(p);
  return typeof t === "object" && t.kind === "dir" ? t.path : p;
}

function docker(args: string[], onLine: Line, extraEnv: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn("docker", args, { env: { ...DOCKER_ENV, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const feed = (d: Buffer) => {
      const text = d.toString("utf8");
      out += text;
      for (const l of text.split(/\r?\n/)) if (l.trim()) onLine(l);
    };
    p.stdout.on("data", feed);
    p.stderr.on("data", feed);
    p.on("error", (e) => resolve({ code: -1, out: String(e) }));
    p.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

/** One restic invocation against one target, sources mounted read-only at /data/<name>. */
function restic(cfg: BackupConfig, t: BackupTarget, args: string[], onLine: Line) {
  const run = ["run", "--rm", "-v", "unaxis_restic_cache:/root/.cache/restic",
    "-e", "RESTIC_PASSWORD", "-e", "RESTIC_REPOSITORY", "-e", "RESTIC_REST_USERNAME", "-e", "RESTIC_REST_PASSWORD"];
  for (const s of cfg.sources) run.push("-v", `${nativePath(s.path)}:/data/${s.name}:ro`);
  if (t.kind === "dir") run.push("-v", `${nativePath(t.path)}:/repo/${t.name}`);
  run.push(BACKUP_DEFAULTS.resticImage, ...args);
  // Secrets reach the container through the client's environment, never argv.
  return docker(run, onLine, {
    RESTIC_PASSWORD: secret("repo-password"),
    RESTIC_REPOSITORY: repoUrl(t, targetHost(t)),
    RESTIC_REST_USERNAME: BACKUP_DEFAULTS.restUser,
    RESTIC_REST_PASSWORD: secret("rest-password"),
  });
}

// ── rest-server on a UNAXIS host ─────────────────────────────────────────────

/**
 * (Re)creates restic's rest-server on an environment: append-only (clients
 * can add snapshots but never delete them), authenticated, data in a named
 * volume that a redeploy keeps.
 */
export async function deployRestServer(envName: string, onLine: Line, port: number = BACKUP_DEFAULTS.serverPort): Promise<number> {
  const env = envByName(envName);
  if (!env?.agentUrl) { onLine(`✗ ${envName}: no UNAXIS host with an agent`); return 1; }
  const c = BACKUP_DEFAULTS;
  const [repo, tag] = c.serverImage.split(":");
  onLine(`• pulling ${c.serverImage} on ${env.name}…`);
  const pull = await dockerFetch(env, `/images/create?fromImage=${repo}&tag=${tag}`, { method: "POST", signal: AbortSignal.timeout(300_000) });
  const pullText = await pull.text();
  if (!pull.ok || /"error"/.test(pullText)) { onLine(`✗ pull failed: ${pullText.slice(-200)}`); return 1; }

  if (!(await dockerFetch(env, `/volumes/${c.serverVolume}`)).ok) {
    await dockerFetch(env, "/volumes/create", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Name: c.serverVolume, Labels: { "unaxis.managed": "true", "unaxis.role": "backup" } }),
    });
  }
  if ((await dockerFetch(env, `/containers/${c.serverContainer}/json`)).ok) {
    onLine(`• replacing ${c.serverContainer} (data volume kept)`);
    await dockerFetch(env, `/containers/${c.serverContainer}?force=true`, { method: "DELETE" });
  }
  const create = await dockerFetch(env, `/containers/create?name=${c.serverContainer}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Image: c.serverImage,
      Env: ["OPTIONS=--append-only"],
      Labels: { "unaxis.managed": "true", "unaxis.role": "backup" },
      ExposedPorts: { "8000/tcp": {} },
      HostConfig: {
        PortBindings: { "8000/tcp": [{ HostIp: "0.0.0.0", HostPort: String(port) }] },
        Mounts: [{ Type: "volume", Source: c.serverVolume, Target: "/data" }],
        RestartPolicy: { Name: "unless-stopped" },
        LogConfig: { Type: "json-file", Config: { "max-size": "10m", "max-file": "3" } },
      },
    }),
  });
  if (!create.ok) { onLine(`✗ create failed: ${(await create.text()).slice(0, 300)}`); return 1; }
  const { Id } = (await create.json()) as { Id: string };
  const start = await dockerFetch(env, `/containers/${Id}/start`, { method: "POST" });
  if (!start.ok && start.status !== 304) { onLine(`✗ start failed (${start.status})`); return 1; }

  // The image's create_user script writes a bcrypt entry to /data/.htpasswd
  // (replacing any existing entry for that user).
  const u = await execIn(env, c.serverContainer, ["create_user", c.restUser, secret("rest-password")], "root", 60_000);
  if (u.code !== 0) { onLine(`✗ could not set the rest-server login: ${u.output.trim().slice(-200)}`); return 1; }
  onLine(`✓ rest-server on ${env.name}:${port} (append-only)`);
  return 0;
}

// ── Commands ─────────────────────────────────────────────────────────────────

async function ensureRepo(cfg: BackupConfig, t: BackupTarget, onLine: Line): Promise<boolean> {
  const probe = await restic(cfg, t, ["cat", "config"], () => {});
  if (probe.code === 0) return true;
  onLine(`• initialising repository on ${t.name}…`);
  const init = await restic(cfg, t, ["init"], onLine);
  return init.code === 0;
}

/** Back up every source to every target (or one). Records the outcome for the scheduler. */
export async function runBackup(onLine: Line, only?: string): Promise<number> {
  const release = takeRunLock();
  if (!release) { onLine("• a backup is already running — skipped"); return 0; }
  try {
    return await runBackupLocked(onLine, only);
  } finally {
    release();
  }
}

async function runBackupLocked(onLine: Line, only?: string): Promise<number> {
  const cfg = loadBackupConfig();
  if (!cfg.sources.length) { onLine("✗ nothing to back up — add one: backup source add <name> <path>"); return 1; }
  const targets = cfg.targets.filter((t) => !only || t.name === only);
  if (!targets.length) { onLine(only ? `✗ no target "${only}"` : "✗ no targets — add one: backup target add <name> --dir <path> | --env <ENV>"); return 1; }
  const hostTag = dbGetEnvironments().find((e) => e.isDefaultTarget)?.name ?? "control-plane";
  const results: string[] = [];
  let failed = 0;
  for (const t of targets) {
    onLine(`── ${t.name} (${t.kind === "dir" ? t.path : `${t.env} rest-server`}) ──`);
    if (!(await ensureRepo(cfg, t, onLine))) { failed++; results.push(`${t.name}: repo unavailable`); continue; }
    const r = await restic(cfg, t, backupArgs(cfg, hostTag), onLine);
    const snap = /snapshot ([0-9a-f]{8}) saved/.exec(r.out)?.[1];
    const added = /Added to the repository: ([^\n]+)/.exec(r.out)?.[1]?.trim();
    if (r.code === 0 && snap) results.push(`${t.name}: ${snap}${added ? ` (+${added})` : ""}`);
    else { failed++; results.push(`${t.name}: failed (exit ${r.code})`); }
  }
  const summary = results.join(" · ");
  saveBackupConfig({ ...loadBackupConfig(), lastRun: { at: new Date().toISOString(), ok: failed === 0, summary } });
  onLine(failed ? `✗ backup: ${summary}` : `✓ backup: ${summary}`);
  return failed ? 1 : 0;
}

export async function listSnapshots(onLine: Line, only?: string): Promise<number> {
  const cfg = loadBackupConfig();
  for (const t of cfg.targets.filter((x) => !only || x.name === only)) {
    onLine(`── ${t.name} ──`);
    await restic(cfg, t, ["snapshots", "--compact"], onLine);
  }
  return 0;
}

export function backupStatus(onLine: Line): number {
  const cfg = loadBackupConfig();
  onLine("workspace backups (restic)");
  for (const s of cfg.sources) onLine(`  source  ${s.name.padEnd(14)} ${s.path}`);
  for (const t of cfg.targets) {
    onLine(`  target  ${t.name.padEnd(14)} ${t.kind === "dir" ? t.path : `rest-server on ${t.env} (${targetHost(t) ?? "address unknown"}:${t.port ?? BACKUP_DEFAULTS.serverPort})`}`);
  }
  onLine(`  nightly ${cfg.schedule ?? "off"}`);
  onLine(`  last    ${cfg.lastRun ? `${cfg.lastRun.at} ${cfg.lastRun.ok ? "✓" : "✗"} ${cfg.lastRun.summary}` : "never"}`);
  onLine(`  keys    ${SECRETS_DIR}  ← keep repo-password in your password manager; without it no backup can be read`);
  return 0;
}

// ── Nightly + run lock ───────────────────────────────────────────────────────

/**
 * One backup at a time, across the dev and prod TUIs and across manual and
 * nightly runs: a lock file in the artifact dir. Returns a release function,
 * or null when another run holds it. A lock older than 6 h is a crashed run.
 */
function takeRunLock(): (() => void) | null {
  const lock = join(SECRETS_DIR, "run.lock");
  mkdirSync(SECRETS_DIR, { recursive: true });
  try {
    writeFileSync(lock, String(process.pid), { flag: "wx" });
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs < 6 * 3600_000) return null;
      writeFileSync(lock, String(process.pid));
    } catch { return null; }
  }
  return () => { try { rmSync(lock, { force: true }); } catch {} };
}

export function backupRunning(): boolean {
  const lock = join(SECRETS_DIR, "run.lock");
  try { return Date.now() - statSync(lock).mtimeMs < 6 * 3600_000; } catch { return false; }
}

/** Called on a timer by the TUI. */
export function backupDue(now = new Date()): boolean {
  const cfg = loadBackupConfig();
  return cfg.targets.length > 0 && !backupRunning() && isDue(cfg.schedule, cfg.lastRun?.at, now);
}

export async function runScheduledBackup(onLine: Line): Promise<number> {
  return runBackup(onLine);
}
