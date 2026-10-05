// src/ink/backup.ts
// ─────────────────────────────────────────────────────────────────────────────
// Workspace backups with restic: encrypted, deduplicated, versioned snapshots
// of everything on the dev drive (code, .git, .env files, vault, state, DB
// dumps), sent to several targets so the drive is never the only copy.
//
// A target is either a directory on the control-plane host, or a UNAXIS
// environment running restic's own rest-server (append-only, so a compromised
// control plane can't delete history). Nothing here assumes which machines
// those are. Pure logic; side effects live in backup-store.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const BACKUP_DEFAULTS = {
  resticImage: "restic/restic:0.19.1",
  serverImage: "restic/rest-server:0.14.0",
  serverContainer: "unt_restic_server",
  serverVolume: "unaxis_restic",
  serverPort: 8010,
  restUser: "unaxis",
  /** Local time of day for the nightly run (HH:MM). */
  schedule: "03:30",
} as const;

export type BackupTarget =
  | { name: string; kind: "dir"; path: string }
  | { name: string; kind: "env"; env: string; port?: number };

export type BackupSource = { name: string; path: string };

export type BackupConfig = {
  sources: BackupSource[];
  targets: BackupTarget[];
  schedule: string | null;
  lastRun?: { at: string; ok: boolean; summary: string };
};

/**
 * restic exclude patterns (a pattern without a slash matches that name at any
 * depth). Only things that are regenerable, or unsafe to copy while running:
 * live Postgres data files are inconsistent mid-write (DB dumps cover them).
 */
export const DEFAULT_EXCLUDES = [
  "node_modules",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "*.tsbuildinfo",
  "next-env.d.ts",
  ".claude/worktrees",
  "supabase-instances/*/docker/volumes/db/data",
  "services/tank-vision-gpu/out/archive-index",
  "services/tank-vision-gpu/out/archive-index-smoke",
  "services/tank-vision-gpu/out/archive-thumbs",
  "services/tank-vision-gpu/out/smoke",
  "services/tank-vision-gpu/out/bakeoff-cache",
];

export function backupConfig(raw: Record<string, any> = {}): BackupConfig {
  return {
    sources: Array.isArray(raw.sources) ? raw.sources.filter((s: any) => s?.name && s?.path) : [],
    targets: Array.isArray(raw.targets) ? raw.targets.filter((t: any) => t?.name && (t.kind === "dir" || t.kind === "env")) : [],
    schedule: raw.schedule === null ? null : typeof raw.schedule === "string" ? raw.schedule : BACKUP_DEFAULTS.schedule,
    lastRun: raw.lastRun,
  };
}

/** Repository location restic should use for a target, as seen from the restic container. */
export function repoUrl(t: BackupTarget, host?: string | null): string {
  if (t.kind === "dir") return `/repo/${t.name}`;
  if (!host) throw new Error(`no address known for ${t.env}`);
  return `rest:http://${host}:${t.port ?? BACKUP_DEFAULTS.serverPort}/workspace`;
}

/** Each source is mounted at /data/<name>, so snapshots keep stable paths whatever the host OS. */
export function backupArgs(cfg: BackupConfig, hostTag: string): string[] {
  const args = ["backup", "--host", hostTag, "--exclude-caches"];
  for (const e of DEFAULT_EXCLUDES) args.push("--exclude", e);
  for (const s of cfg.sources) args.push(`/data/${s.name}`);
  return args;
}

/** Due when the scheduled time has passed today and the last run was before it. */
export function isDue(schedule: string | null, lastRunAt: string | undefined, now: Date): boolean {
  if (!schedule) return false;
  const m = /^(\d{1,2}):(\d{2})$/.exec(schedule);
  if (!m) return false;
  const slot = new Date(now);
  slot.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (now < slot) return false;
  return !lastRunAt || new Date(lastRunAt) < slot;
}

export function validName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,30}$/.test(name);
}

/**
 * Variables for `docker run -e NAME` must reach the docker CLI's environment.
 * Under WSL, `docker` is a wrapper for Windows docker.exe, and WSL hands a
 * Windows program only the variables listed in WSLENV — so every RESTIC_* was
 * dropped and restic ran with no repository ("Please specify repository
 * location"): every backup failed from 2026-10-02 once the TUI moved to WSL.
 */
export function wslEnvFor(names: string[], current = process.env.WSLENV ?? ""): string {
  const have = new Set(current.split(":").filter(Boolean).map((e) => e.split("/")[0]));
  const add = names.filter((n) => !have.has(n));
  return [current, ...add].filter(Boolean).join(":");
}

/**
 * A host folder as `docker run -v` should name it: drive-letter form.
 * Docker Desktop accepts `Z:/...` from both Windows and WSL, but a WSL path
 * (`/mnt/z/...`) given to docker.exe — which is what `docker` is under WSL —
 * names a folder inside Docker's VM instead, and Docker quietly creates it
 * empty. Backups then snapshotted 0 B (2026-10-05).
 */
export function dockerBindPath(p: string): string {
  const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/.exec(p);
  if (mnt) return `${mnt[1].toUpperCase()}:/${mnt[2] ?? ""}`.replace(/\/+$/, "") || `${mnt[1].toUpperCase()}:/`;
  const win = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (win) return `${win[1].toUpperCase()}:/${win[2].replace(/\\/g, "/")}`.replace(/\/+$/, "");
  return p;
}
